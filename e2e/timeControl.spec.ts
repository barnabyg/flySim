import { expect, test, type Page } from "@playwright/test";
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

const BEHAVIOUR_COLOURS = { immobility: "#4f7cac", walking: "#e0a030" };

for (const speed of [60, 1000]) {
  test(`the ribbon shows each behaviour in its colour, matching the record at ${speed}×`, async ({
    page,
  }) => {
    await openApp(page, 5);
    await setSpeed(page, speed);
    await page.waitForTimeout(speed === 1000 ? 10_000 : 20_000);
    await page.locator("#pause").click();
    await page.waitForTimeout(300);

    const ribbon = await readRibbon(page);
    const record = await runRecord(page);
    const secondsPerColumn = (ribbon.windowEnd - ribbon.windowStart) / ribbon.columns.length;

    // Independently works out the share of walking in a column from the run record.
    const walkingShare = (start: number, end: number): number => {
      let behaviour = record.firedTransitions[0]?.from ?? "immobility";
      let from = 0;
      let walking = 0;
      const addSpan = (to: number): void => {
        const overlap = Math.min(to, end) - Math.max(from, start);
        if (behaviour === "walking" && overlap > 0) walking += overlap;
      };
      for (const fired of record.firedTransitions) {
        addSpan(fired.timeSeconds);
        behaviour = fired.to;
        from = fired.timeSeconds;
      }
      addSpan(end);
      return walking / (end - start);
    };

    let checked = 0;
    let sawWalking = false;
    let sawImmobility = false;
    ribbon.columns.forEach((column, x) => {
      const start = ribbon.windowStart + x * secondsPerColumn;
      if (start < 0) return;
      const expected = walkingShare(start, start + secondsPerColumn);
      expect(Math.abs((column[BEHAVIOUR_COLOURS.walking] ?? 0) - expected)).toBeLessThan(0.1);
      sawWalking ||= (column[BEHAVIOUR_COLOURS.walking] ?? 0) > 0;
      sawImmobility ||= (column[BEHAVIOUR_COLOURS.immobility] ?? 0) > 0;
      checked += 1;
    });

    expect(checked).toBeGreaterThan(100);
    expect(sawWalking).toBe(true);
    expect(sawImmobility).toBe(true);
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
