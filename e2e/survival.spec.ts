import { expect, test } from "@playwright/test";
import { currentSample, currentTime, openApp, runRecord } from "./helpers";

test("removing the food takes it away as an Intervention, and putting it back restores it", async ({
  page,
}) => {
  await openApp(page);
  const button = page.locator("#food-presence");
  await expect(button).toHaveAccessibleName("Remove the food");
  const place = (await currentSample(page))?.food;

  await button.click();
  await expect(button).toHaveAccessibleName("Put the food back");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await currentSample(page))?.food).toBeNull();
  expect(await page.evaluate(() => window.flySim.sources().food)).toBeNull();
  // The water is still there.
  expect((await currentSample(page))?.water).not.toBeNull();

  await button.click();
  await expect(button).toHaveAccessibleName("Remove the food");
  await expect.poll(async () => (await currentSample(page))?.food).toEqual(place);
  expect((await runRecord(page)).interventions.map(({ type, step }) => ({ type, step }))).toEqual([
    { type: "remove-source", step: expect.any(Number) },
    { type: "restore-source", step: expect.any(Number) },
  ]);
});

test("removing a source while paused hides it at once", async ({ page }) => {
  await openApp(page);
  await page.locator("#pause").click();
  await page.locator("#water-presence").click();

  expect(await page.evaluate(() => window.flySim.sources().water)).toBeNull();
  expect((await currentSample(page))?.water).not.toBeNull();
  await page.locator("#pause").click();
  await expect.poll(async () => (await currentSample(page))?.water).toBeNull();
});

test("without water the fly dies, the run stops, and restart still works", async ({ page }) => {
  // It runs at the top speed, which is heavy for a page beside others, so it gets longer.
  test.setTimeout(120_000);
  // As dry as a run can start, so that it dies within the first simulated hour. It starts
  // slowly, so the water goes before the fly could reach it, and then runs at the top speed.
  await page.goto("/?seed=8&speed=1&hydration=0.01");
  await expect.poll(() => currentSample(page).then(Boolean), { timeout: 30_000 }).toBe(true);
  expect((await runRecord(page)).samples[0]?.hydration).toBeCloseTo(0.01, 6);
  await page.locator("#water-presence").click();
  const speed = page.locator("#speed");
  await speed.fill(await speed.evaluate((slider) => (slider as HTMLInputElement).max));
  await expect(page.locator("#speed-readout")).toHaveText("1000×");

  await expect
    .poll(async () => (await currentSample(page))?.death?.cause, { timeout: 45_000 })
    .toBe("desiccation");
  await expect(page.locator("#death")).toBeVisible();
  await expect(page.locator("#death")).toContainText("lack of water");
  const view = await page.evaluate(() => window.flySim.view());
  expect(view.flyPose.dead).toBe(true);

  // Nothing moves on: not the time, the bars or the ribbon.
  const time = await currentTime(page);
  const ribbonEnd = await page.locator("#ribbon").getAttribute("data-window-end");
  await page.waitForTimeout(1000);
  expect(await currentTime(page)).toBe(time);
  expect(await page.locator("#ribbon").getAttribute("data-window-end")).toBe(ribbonEnd);
  expect((await currentSample(page))?.transitions).toEqual([]);
  expect((await runRecord(page)).death?.cause).toBe("desiccation");

  // The run can't change any more, so neither can what the Room shows.
  await expect(page.locator("#food-presence")).toBeDisabled();
  await expect(page.locator("#disturb")).toBeDisabled();
  const food = await page.evaluate(() => window.flySim.sources().food);
  if (!food) throw new Error("the food isn't showing");
  await page.mouse.move(food.client.x, food.client.y);
  await page.mouse.down();
  await page.mouse.move(food.client.x + 100, food.client.y, { steps: 5 });
  await page.mouse.up();
  // The press orbits the camera instead, which leaves the food where it was.
  expect((await page.evaluate(() => window.flySim.sources().food))?.place).toEqual(food.place);
  expect((await runRecord(page)).interventions.map((each) => each.type)).toEqual(["remove-source"]);

  await page.locator("#restart").click();
  // The same seed, alive again.
  await expect.poll(async () => (await currentSample(page))?.death, { timeout: 30_000 }).toBeNull();
  expect(await page.evaluate(() => window.flySim.seed)).toBe(8);
  await expect(page.locator("#death")).toBeHidden();
});
