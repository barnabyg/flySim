import { expect, test, type Page } from "@playwright/test";
import { countPixels, currentSample, currentTime, meanBrightness, openApp } from "./helpers";

/** A short day, so that lights-off comes after a few seconds at the default speed. */
const SHORT_DAY_URL = "/?seed=7&lightHours=0.2";

async function waitForNight(page: Page): Promise<void> {
  await expect
    .poll(async () => (await currentSample(page))?.lightLevel, { timeout: 45_000 })
    .toBe(0);
  await page.waitForTimeout(200);
}

test("the Room's lighting changes when simulated time crosses lights-off", async ({ page }) => {
  await page.goto(SHORT_DAY_URL);
  await expect.poll(() => currentSample(page).then(Boolean), { timeout: 30_000 }).toBe(true);
  expect((await currentSample(page))?.lightLevel).toBe(1);
  await expect.poll(() => meanBrightness(page, "#scene")).toBeGreaterThan(40);
  const day = await meanBrightness(page, "#scene");
  // On a slow page the reading could have come after lights-off, which would prove nothing.
  expect((await currentSample(page))?.lightLevel).toBe(1);

  await waitForNight(page);
  const night = await meanBrightness(page, "#scene");

  expect(night).toBeLessThan(0.6 * day);
  // Still dimly lit, rather than black.
  expect(night).toBeGreaterThan(5);
});

test("the fly stays findable at night in both views", async ({ page }) => {
  await page.goto(SHORT_DAY_URL);
  await waitForNight(page);

  // The ring marks the fly in the wide view, and it isn't dimmed by the night.
  const box = await page.locator("#scene").boundingBox();
  if (!box) throw new Error("no scene");
  await expect.poll(() => countPixels(page, box, "ring"), { timeout: 10_000 }).toBeGreaterThan(0);

  // The close-up shows the fly's body against the dim Room.
  await page.locator("#inset").click();
  await expect.poll(() => countPixels(page, box, "dark"), { timeout: 10_000 }).toBeGreaterThan(50);
  const closeUp = await meanBrightness(page, "#scene");
  expect(closeUp).toBeGreaterThan(5);
});

test("the time of day stays correct across pause, speed changes and restart", async ({ page }) => {
  await openApp(page, 11);
  const shown = async (): Promise<{ text: string; expected: string }> =>
    page.evaluate(() => {
      const hours = window.flySim.current()?.timeOfDayHours ?? NaN;
      const minutes = Math.floor(hours * 60);
      const pad = (value: number): string => String(value).padStart(2, "0");
      return {
        text: document.querySelector("#time-of-day")?.textContent ?? "",
        expected: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
      };
    });
  const expectCorrect = async (): Promise<void> => {
    const { text, expected } = await shown();
    expect(text).toBe(expected);
  };

  await expect.poll(() => currentTime(page)).toBeGreaterThan(60);
  await expectCorrect();

  await page.locator("#pause").click();
  await page.waitForTimeout(300);
  await expectCorrect();
  const pausedText = (await shown()).text;
  await page.waitForTimeout(500);
  expect((await shown()).text).toBe(pausedText);
  await page.locator("#pause").click();

  await page.locator("#speed").fill("10");
  await expect.poll(() => currentTime(page)).toBeGreaterThan(1800);
  await expectCorrect();
  await expect(page.locator("#day-dial")).toHaveAccessibleName(/^Time of day \d\d:\d\d$/);

  await page.locator("#restart").click();
  // A restart loads the page again, so the new run has no state until its first frame.
  await expect
    .poll(async () => (await currentSample(page))?.timeSeconds ?? Infinity, { intervals: [20] })
    .toBeLessThan(600);
  await expect(page.locator("#time-of-day")).toHaveText(/^0[6-7]:\d\d$/);
  await expectCorrect();
});

test("the time of day's number shows only on hover, beside an always-visible dial", async ({
  page,
}) => {
  await openApp(page);
  await page.mouse.move(5, 5);
  await expect(page.locator("#day-dial")).toBeVisible();
  await expect(page.locator("#time-of-day")).toBeHidden();
  await page.locator("#ribbon").hover();
  await expect(page.locator("#time-of-day")).toBeVisible();
});
