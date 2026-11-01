import { expect, test, type Page } from "@playwright/test";
import { countPixels, currentSample, currentTime, openApp, runRecord } from "./helpers";

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

test("the fly is drawn at true scale", async ({ page }) => {
  await openApp(page);
  for (let i = 0; i < 3; i++) {
    const { flyLengthInScene } = await page.evaluate(() => window.flySim.view());
    // An adult male is about 2.5 mm long.
    expect(flyLengthInScene).toBeCloseTo(0.0025, 5);
    await page.waitForTimeout(300);
  }
  await page.locator("#inset").click();
  const { flyLengthInScene } = await page.evaluate(() => window.flySim.view());
  expect(flyLengthInScene).toBeCloseTo(0.0025, 5);
});

test("the fly's legs move while it walks, and it is still during Immobility", async ({ page }) => {
  await openApp(page);
  await page.locator("#speed").fill("0");

  const frame = () =>
    page.evaluate(() => {
      const sample = window.flySim.current();
      return {
        behaviour: sample?.behaviour,
        time: sample?.timeSeconds,
        feet: window.flySim.view().flyFeet,
      };
    });
  /** Watches for a little real time at 1× and reports whether the feet changed. */
  const watch = async (behaviour: string): Promise<boolean> => {
    const before = await frame();
    await page.waitForTimeout(250);
    const after = await frame();
    if (before.behaviour !== behaviour || after.behaviour !== behaviour) {
      throw new Error(`not ${behaviour} throughout`);
    }
    expect(after.time).toBeGreaterThan(before.time ?? Infinity);
    return JSON.stringify(before.feet) !== JSON.stringify(after.feet);
  };
  const waitFor = async (behaviour: string): Promise<void> => {
    await page.locator("#speed").fill("6");
    await expect
      .poll(async () => (await frame()).behaviour, { timeout: 30_000, intervals: [20] })
      .toBe(behaviour);
    await page.locator("#speed").fill("0");
    await page.waitForTimeout(100);
  };

  await expect(async () => {
    await waitFor("walking");
    expect(await watch("walking")).toBe(true);
  }).toPass({ timeout: 40_000 });
  await expect(async () => {
    await waitFor("immobility");
    expect(await watch("immobility")).toBe(false);
  }).toPass({ timeout: 40_000 });
});

test("the fly stands on six feet during Immobility", async ({ page }) => {
  await openApp(page);
  await expect(async () => {
    await expect
      .poll(() => currentSample(page).then((sample) => sample?.behaviour), { intervals: [20] })
      .toBe("immobility");
    await page.locator("#pause").click();
    await page.waitForTimeout(200);
    // The fly may have started walking between seeing Immobility and pausing.
    if ((await currentSample(page))?.behaviour !== "immobility") {
      await page.locator("#pause").click();
      throw new Error("paused outside Immobility");
    }
  }).toPass({ timeout: 40_000 });
  const { flyFeet } = await page.evaluate(() => window.flySim.view());
  expect(flyFeet).toHaveLength(6);
  for (const foot of flyFeet) expect(foot.y).toBeCloseTo(0, 6);
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
  // The fly is now large in the main view.
  await expect.poll(() => countPixels(page, belowInset, "dark")).toBeGreaterThan(200);

  await page.locator("#inset").click();
  expect(await mainCamera()).toBe("monitoring");
  await expect.poll(() => countPixels(page, belowInset, "dark")).toBeLessThan(200);
});
