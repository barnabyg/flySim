import { expect, test, type Page } from "@playwright/test";
import { BEHAVIOURS, type Behaviour } from "../src/engine";
import { BEHAVIOUR_COLOURS, SLEEP_DEPTH_COLOURS } from "../src/viewer/palette";
import { currentTime, openApp, runRecord } from "./helpers";

const SPEEDS_INDEX: Readonly<Record<number, string>> = { 1: "0", 60: "6", 1000: "10" };

async function setSpeed(page: Page, speed: number): Promise<void> {
  await page.locator("#speed").fill(SPEEDS_INDEX[speed] ?? "");
  await expect(page.locator("#speed-readout")).toHaveText(`${speed}×`);
}

test("speed defaults to 60× and can be set from 1× to about 1000×", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("#speed-readout")).toHaveText("60×");

  const rateOver = async (milliseconds: number): Promise<number> => {
    const before = await currentTime(page);
    await page.waitForTimeout(milliseconds);
    return ((await currentTime(page)) - before) / (milliseconds / 1000);
  };

  // Frames from the old speed may still be queued on a busy page, so the rate has to settle.
  await setSpeed(page, 1);
  await expect(async () => {
    const slow = await rateOver(1000);
    expect(slow).toBeGreaterThan(0.5);
    expect(slow).toBeLessThan(2);
  }).toPass({ timeout: 15_000 });

  await setSpeed(page, 1000);
  await expect(async () => {
    const fast = await rateOver(1000);
    expect(fast).toBeGreaterThan(500);
    expect(fast).toBeLessThan(1200);
  }).toPass({ timeout: 15_000 });
});

test("simulated time doesn't advance while paused, and resumes", async ({ page }) => {
  await openApp(page);
  const toggle = page.locator("#pause");

  await toggle.click();
  await page.waitForTimeout(200);
  const pausedAt = await currentTime(page);
  await page.waitForTimeout(1000);
  expect(await currentTime(page)).toBe(pausedAt);

  await toggle.click();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(pausedAt);
});

test("changing speed gives the same run record as an unchanged run", async ({ browser }) => {
  const unchanged = await browser.newPage();
  const changed = await browser.newPage();
  await Promise.all([openApp(unchanged, 77), openApp(changed, 77)]);

  await setSpeed(changed, 1000);
  await changed.waitForTimeout(500);
  await setSpeed(changed, 1);
  await changed.locator("#pause").click();
  await changed.waitForTimeout(300);
  await changed.locator("#pause").click();
  await setSpeed(changed, 1000);
  await expect.poll(() => currentTime(unchanged), { timeout: 30_000 }).toBeGreaterThan(300);
  await expect.poll(() => currentTime(changed), { timeout: 30_000 }).toBeGreaterThan(300);

  const [a, b] = await Promise.all([runRecord(unchanged), runRecord(changed)]);
  const end = Math.min(a.samples.at(-1)?.timeSeconds ?? 0, b.samples.at(-1)?.timeSeconds ?? 0);
  const upToEnd = <T extends { timeSeconds: number }>(items: readonly T[]): T[] =>
    items.filter((item) => item.timeSeconds <= end);

  expect(end).toBeGreaterThan(250);
  expect(upToEnd(a.firedTransitions).length).toBeGreaterThan(0);
  expect(upToEnd(b.samples)).toEqual(upToEnd(a.samples));
  expect(upToEnd(b.firedTransitions)).toEqual(upToEnd(a.firedTransitions));
  await Promise.all([unchanged.close(), changed.close()]);
});

/** The share of each ribbon column in each colour, read from the canvas itself. */
async function readRibbon(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#ribbon");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) throw new Error("No ribbon");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const columns: Record<string, number>[] = [];
    for (let x = 0; x < canvas.width; x++) {
      const column: Record<string, number> = {};
      for (let y = 0; y < canvas.height; y++) {
        const i = 4 * (y * canvas.width + x);
        const key = [data[i], data[i + 1], data[i + 2]]
          .map((value) => (value ?? 0).toString(16).padStart(2, "0"))
          .join("");
        column[`#${key}`] = (column[`#${key}`] ?? 0) + 1 / canvas.height;
      }
      columns.push(column);
    }
    return {
      columns,
      windowStart: Number(canvas.dataset["windowStart"]),
      windowEnd: Number(canvas.dataset["windowEnd"]),
    };
  });
}

/** Sleep is drawn in shades of Sleep Depth, so its share is all of those colours together. */
function coloursOf(behaviour: Behaviour): readonly string[] {
  return behaviour === "sleeping" ? SLEEP_DEPTH_COLOURS : [BEHAVIOUR_COLOURS[behaviour]];
}

function noShares(): Record<Behaviour, number> {
  return Object.fromEntries(BEHAVIOURS.map((behaviour) => [behaviour, 0])) as Record<
    Behaviour,
    number
  >;
}

/**
 * How long to watch seed 5 at each speed, and the behaviours it then shows long enough to
 * check their colour. Flights last about half a second, too short to fill any of a column
 * at 1000×.
 */
const RIBBON_RUNS: readonly {
  speed: number;
  watchMilliseconds: number;
  checked: readonly Behaviour[];
}[] = [
  {
    speed: 60,
    watchMilliseconds: 20_000,
    checked: ["immobility", "grooming", "walking", "flying"],
  },
  {
    speed: 1000,
    // Long enough to fill over 100 of the ribbon's columns beside the footer's controls.
    watchMilliseconds: 15_000,
    checked: ["immobility", "grooming", "walking", "sleeping"],
  },
];

for (const { speed, watchMilliseconds, checked } of RIBBON_RUNS) {
  test(`the ribbon shows each behaviour in its colour, matching the record at ${speed}×`, async ({
    page,
  }) => {
    await openApp(page, 5);
    await setSpeed(page, speed);
    await page.waitForTimeout(watchMilliseconds);
    await page.locator("#pause").click();
    await page.waitForTimeout(300);

    const ribbon = await readRibbon(page);
    const record = await runRecord(page);
    const secondsPerColumn = (ribbon.windowEnd - ribbon.windowStart) / ribbon.columns.length;

    // Independently works out the share of each behaviour in a column from the run record.
    const sharesOf = (start: number, end: number): Record<Behaviour, number> => {
      const shares = noShares();
      let behaviour = record.firedTransitions[0]?.from ?? "immobility";
      let from = 0;
      const addSpan = (to: number): void => {
        const overlap = Math.min(to, end) - Math.max(from, start);
        if (overlap > 0) shares[behaviour] += overlap / (end - start);
      };
      for (const fired of record.firedTransitions) {
        addSpan(fired.timeSeconds);
        behaviour = fired.to;
        from = fired.timeSeconds;
      }
      addSpan(end);
      return shares;
    };

    let columns = 0;
    const peak = noShares();
    ribbon.columns.forEach((column, x) => {
      const start = ribbon.windowStart + x * secondsPerColumn;
      if (start < 0) return;
      const expected = sharesOf(start, start + secondsPerColumn);
      for (const behaviour of BEHAVIOURS) {
        const drawn = coloursOf(behaviour).reduce((sum, colour) => sum + (column[colour] ?? 0), 0);
        expect(Math.abs(drawn - expected[behaviour]), `${behaviour} at column ${x}`).toBeLessThan(
          0.1,
        );
        peak[behaviour] = Math.max(peak[behaviour], expected[behaviour]);
      }
      columns += 1;
    });

    expect(columns).toBeGreaterThan(100);
    // A behaviour can only be checked where it fills a good part of some column, well above the
    // tolerance. Flights last a second and a half at most, and one can straddle two columns of
    // about 5 s, so a flight is sure only of about 15% of one.
    for (const behaviour of checked) {
      const enough = behaviour === "flying" ? 0.13 : 0.2;
      expect(peak[behaviour], `${behaviour}'s largest share of a column`).toBeGreaterThan(enough);
    }
  });
}

test("controls use icons with minimal text", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("#pause svg")).toBeVisible();
  await expect(page.locator("#pause")).toHaveText("");
  await expect(page.locator("#pause")).toHaveAccessibleName("Pause");
  await page.locator("#pause").click();
  await expect(page.locator("#pause")).toHaveAccessibleName("Resume");

  // The simulated time is a number, so it only shows on hover.
  await page.mouse.move(5, 5);
  await expect(page.locator("#clock")).toBeHidden();
  await page.locator("#ribbon").hover();
  await expect(page.locator("#clock")).toBeVisible();
});
