import { expect, test, type Page } from "@playwright/test";
import { currentSample, currentTime, meanBrightness, openApp, runRecord } from "./helpers";

async function dialBackground(page: Page): Promise<string> {
  return page.locator("#day-dial").evaluate((dial) => (dial as HTMLElement).style.background);
}

test("changing the schedule adds an intervention and changes the Room's lighting", async ({
  page,
}) => {
  await openApp(page);
  await expect.poll(() => currentTime(page)).toBeGreaterThan(30);
  expect((await currentSample(page))?.lightLevel).toBe(1);
  await expect.poll(() => meanBrightness(page, "#scene")).toBeGreaterThan(40);
  const day = await meanBrightness(page, "#scene");
  const dayDial = await dialBackground(page);

  await page.locator("#light-settings summary").click();
  await expect(page.locator("#always-off svg")).toBeVisible();
  await page.locator("#always-off").click();

  await expect.poll(async () => (await currentSample(page))?.lightLevel).toBe(0);
  const { interventions } = await runRecord(page);
  expect(interventions).toHaveLength(1);
  expect(interventions[0]).toMatchObject({
    type: "light-schedule",
    lightSchedule: { lightHours: 0 },
  });
  expect(interventions[0]?.step).toBeGreaterThan(0);
  await expect.poll(() => meanBrightness(page, "#scene")).toBeLessThan(0.6 * day);
  expect(await dialBackground(page)).not.toBe(dayDial);
  // The menu closes once the change is made, and the ribbon gets no Disturb mark.
  await expect(page.locator("#light-form")).toBeHidden();
  expect(await page.locator("#ribbon").getAttribute("data-marks")).toBe("0");
});

test("sets lights-on and lights-off by the Room's clock", async ({ page }) => {
  await openApp(page, 5);
  await page.locator("#light-settings summary").click();
  await expect(page.locator("#lights-on")).toHaveValue("06:00");
  await expect(page.locator("#lights-off")).toHaveValue("18:00");

  // From early morning, the light now comes on at noon.
  await page.locator("#lights-on").fill("12:00");
  await page.locator("#lights-off").fill("20:30");
  await page.locator("#light-apply").click();

  await expect
    .poll(async () => (await currentSample(page))?.lightSchedule)
    .toEqual({ lightsOnHour: 12, lightHours: 8.5 });
  expect((await currentSample(page))?.lightLevel).toBe(0);
  const { interventions } = await runRecord(page);
  expect(interventions.map(({ type }) => type)).toEqual(["light-schedule"]);
});

test("restarting with the same seed returns to the starting schedule", async ({ page }) => {
  await openApp(page, 9);
  await page.locator("#light-settings summary").click();
  await page.locator("#always-on").click();
  await expect.poll(async () => (await runRecord(page)).interventions).toHaveLength(1);

  await page.locator("#restart").click();
  await expect
    .poll(async () => (await currentSample(page))?.timeSeconds ?? Infinity, { intervals: [20] })
    .toBeLessThan(30);

  expect((await runRecord(page)).interventions).toEqual([]);
  expect((await currentSample(page))?.lightSchedule).toEqual({ lightsOnHour: 6, lightHours: 12 });
});
