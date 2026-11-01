import { expect, test, type Page } from "@playwright/test";
import { countPixels, currentTime, openApp, runRecord } from "./helpers";

async function regionOf(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`No box for ${selector}`);
  return box;
}

async function dragAcrossView(page: Page): Promise<void> {
  const view = await regionOf(page, "#view");
  await page.mouse.move(view.x + view.width * 0.3, view.y + view.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(view.x + view.width * 0.5, view.y + view.height * 0.5, { steps: 8 });
  await page.mouse.up();
}

test("the main camera shows the whole Room by default", async ({ page }) => {
  await openApp(page);
  const { roomCornersInMainView, mainCamera } = await page.evaluate(() => window.flySim.view());

  expect(mainCamera).toBe("monitoring");
  expect(roomCornersInMainView).toHaveLength(8);
  for (const corner of roomCornersInMainView) {
    expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(corner.y)).toBeLessThanOrEqual(1);
  }
});

test("orbiting the main camera moves it without any effect on the run", async ({ browser }) => {
  const orbited = await browser.newPage();
  const untouched = await browser.newPage();
  await Promise.all([openApp(orbited, 19), openApp(untouched, 19)]);

  const before = await orbited.evaluate(() => window.flySim.view().monitoringCameraPosition);
  await dragAcrossView(orbited);
  const after = await orbited.evaluate(() => window.flySim.view().monitoringCameraPosition);
  expect(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)).toBeGreaterThan(
    0.1,
  );

  await expect.poll(() => currentTime(orbited), { timeout: 20_000 }).toBeGreaterThan(120);
  await expect.poll(() => currentTime(untouched), { timeout: 20_000 }).toBeGreaterThan(120);
  const [a, b] = await Promise.all([runRecord(orbited), runRecord(untouched)]);
  const length = Math.min(a.samples.length, b.samples.length);
  expect(length).toBeGreaterThan(100);
  expect(a.samples.slice(0, length)).toEqual(b.samples.slice(0, length));
  await Promise.all([orbited.close(), untouched.close()]);
});

test("the fly is never scaled up beyond true scale", async ({ page }) => {
  await openApp(page);
  for (let i = 0; i < 3; i++) {
    const { flyLengthInScene } = await page.evaluate(() => window.flySim.view());
    // An adult male is about 2.5 mm long.
    expect(flyLengthInScene).toBeLessThanOrEqual(0.0025 + 1e-6);
    await page.waitForTimeout(300);
  }
  await page.locator("#inset").click();
  const { flyLengthInScene } = await page.evaluate(() => window.flySim.view());
  expect(flyLengthInScene).toBeLessThanOrEqual(0.0025 + 1e-6);
});

test("a subtle ring marks the small fly in the wide view, but not in the close-up", async ({
  page,
}) => {
  await openApp(page);
  const inset = await regionOf(page, "#inset");
  const view = await regionOf(page, "#view");

  await expect
    .poll(() =>
      countPixels(page, { x: view.x, y: view.y, width: view.width, height: view.height }, "ring"),
    )
    .toBeGreaterThan(5);
  expect(await countPixels(page, inset, "ring")).toBe(0);

  // Swapped, the close-up fills the main view and still has no ring.
  await page.locator("#inset").click();
  await page.waitForTimeout(200);
  expect(
    await countPixels(
      page,
      { x: view.x, y: view.y + inset.height + 20, width: view.width, height: 300 },
      "ring",
    ),
  ).toBe(0);
});

test("the close-up tracks the fly continuously while it moves", async ({ page }) => {
  await openApp(page);
  const positions = new Set<string>();
  for (let i = 0; i < 60 && positions.size < 3; i++) {
    const { flyInCloseUp, closeUpDistance, flyScenePosition } = await page.evaluate(() => ({
      ...window.flySim.view(),
      flyScenePosition: window.flySim.flyScenePosition(),
    }));
    positions.add(`${flyScenePosition.x},${flyScenePosition.z}`);
    expect(Math.abs(flyInCloseUp.x)).toBeLessThan(0.01);
    expect(Math.abs(flyInCloseUp.y)).toBeLessThan(0.01);
    expect(closeUpDistance).toBeLessThan(0.05);
    await page.waitForTimeout(500);
  }
  expect(positions.size).toBeGreaterThanOrEqual(3);

  const inset = await regionOf(page, "#inset");
  expect(await countPixels(page, inset, "dark")).toBeGreaterThan(30);
});

test("the close-up and main view can be swapped and swapped back", async ({ page }) => {
  await openApp(page);
  const mainCamera = (): Promise<string> => page.evaluate(() => window.flySim.view().mainCamera);
  const view = await regionOf(page, "#view");
  const inset = await regionOf(page, "#inset");
  const belowInset = { x: view.x, y: inset.y + inset.height + 10, width: view.width, height: 300 };

  await page.locator("#inset").click();
  expect(await mainCamera()).toBe("close-up");
  // The marker is now large in the main view.
  await expect.poll(() => countPixels(page, belowInset, "dark")).toBeGreaterThan(200);

  await page.locator("#inset").click();
  expect(await mainCamera()).toBe("monitoring");
  await expect.poll(() => countPixels(page, belowInset, "dark")).toBeLessThan(200);
});
