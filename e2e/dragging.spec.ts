import { expect, test, type Page } from "@playwright/test";
import type { SourceKind } from "../src/engine";
import { currentSample, openApp, runRecord } from "./helpers";

async function sources(page: Page) {
  return page.evaluate(() => window.flySim.sources());
}

/** Drags a source by the given number of pixels in the main view, in small steps. */
async function drag(page: Page, kind: SourceKind, by: { x: number; y: number }): Promise<void> {
  const start = (await sources(page))[kind]?.client;
  if (!start) throw new Error(`${kind} isn't showing`);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 10 });
  await page.mouse.up();
}

test("dragging the food moves it in the run, as an Intervention, without orbiting", async ({
  page,
}) => {
  await openApp(page);
  const before = await sources(page);
  const camera = (await page.evaluate(() => window.flySim.view())).monitoringCameraPosition;

  await drag(page, "food", { x: 120, y: -60 });

  const after = (await sources(page)).food?.place;
  expect(after).toBeDefined();
  expect(after).not.toEqual(before.food?.place);
  expect((await page.evaluate(() => window.flySim.view())).monitoringCameraPosition).toEqual(
    camera,
  );
  await expect
    .poll(async () => (await runRecord(page)).interventions.map((each) => each.type))
    .toEqual(["move-source"]);
  const [move] = (await runRecord(page)).interventions;
  expect(move).toMatchObject({ type: "move-source", source: "food", place: after });
  await expect.poll(async () => (await currentSample(page))?.food).toEqual(after);
  // The water stayed where it was.
  expect((await sources(page)).water?.place).toEqual(before.water?.place);
});

test("dragging while paused moves the source at once, and the fly gets it on resuming", async ({
  page,
}) => {
  await openApp(page);
  await page.locator("#pause").click();
  const original = (await currentSample(page))?.water;

  await drag(page, "water", { x: -150, y: 40 });

  const shown = (await sources(page)).water?.place;
  expect(shown).not.toEqual(original);
  await page.waitForTimeout(300);
  expect((await currentSample(page))?.water).toEqual(original);
  expect((await runRecord(page)).interventions).toHaveLength(1);

  await page.locator("#pause").click();
  await expect.poll(async () => (await currentSample(page))?.water).toEqual(shown);
});

test("a source dragged beyond the walls stays on the floor inside the Room", async ({ page }) => {
  await page.goto("/?seed=7&width=0.3&depth=0.5&height=0.2");
  await expect.poll(() => currentSample(page).then(Boolean), { timeout: 30_000 }).toBe(true);
  await page.locator("#pause").click();

  await drag(page, "food", { x: -2000, y: 2000 });

  const place = (await sources(page)).food?.place;
  if (!place) throw new Error("the food isn't showing");
  expect(place.x).toBeGreaterThanOrEqual(0);
  expect(place.x).toBeLessThanOrEqual(0.3);
  expect(place.y).toBeGreaterThanOrEqual(0);
  expect(place.y).toBeLessThanOrEqual(0.5);
  expect(place.x === 0 || place.x === 0.3 || place.y === 0 || place.y === 0.5).toBe(true);
});
