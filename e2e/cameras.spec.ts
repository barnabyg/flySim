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

test("the fly's legs match what it is doing", async ({ page }) => {
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
  /** Watches for a little real time at 1× and reports how many feet moved. */
  const feetMovedWhile = async (behaviour: string): Promise<number> => {
    const before = await frame();
    await page.waitForTimeout(250);
    const after = await frame();
    if (before.behaviour !== behaviour || after.behaviour !== behaviour) {
      throw new Error(`not ${behaviour} throughout`);
    }
    expect(after.time).toBeGreaterThan(before.time ?? Infinity);
    return before.feet.filter(
      (foot, index) => JSON.stringify(foot) !== JSON.stringify(after.feet[index]),
    ).length;
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
    expect(await feetMovedWhile("walking")).toBe(6);
  }).toPass({ timeout: 40_000 });
  await expect(async () => {
    await waitFor("immobility");
    expect(await feetMovedWhile("immobility")).toBe(0);
  }).toPass({ timeout: 40_000 });
  // Grooming rubs only the two front legs together.
  await expect(async () => {
    await waitFor("grooming");
    expect(await feetMovedWhile("grooming")).toBe(2);
  }).toPass({ timeout: 40_000 });
});

test("wings blur only in flight, and a ground shadow shows height off the floor", async ({
  page,
}) => {
  await openApp(page);
  // A flight lasts a second or two, which is a few frames at this speed even when rendering is slow.
  await page.locator("#speed").fill("3");
  // Pairs each frame's pose with the sample it was drawn from, until it has seen them all.
  const frames = await page.evaluate(
    () =>
      new Promise<{ wings: string[]; shadows: string[] }>((resolve) => {
        const wings = new Set<string>();
        const shadows = new Set<string>();
        const started = performance.now();
        const watch = (): void => {
          const { flyPose, shadow } = window.flySim.view();
          wings.add(`${flyPose.behaviour} ${flyPose.wings}`);
          const fly = window.flySim.flyScenePosition();
          const offFloor = fly.y > 0;
          const below = Math.hypot(shadow.x - fly.x, shadow.z - fly.z) < 1e-9 && shadow.y < 0.001;
          shadows.add(`off floor ${offFloor}, visible ${shadow.visible}, below ${below}`);
          const seenAll =
            wings.has("flying blur") &&
            wings.has("immobility rest") &&
            wings.has("walking rest") &&
            shadows.has("off floor true, visible true, below true");
          if (seenAll || performance.now() - started > 50_000) {
            resolve({ wings: [...wings], shadows: [...shadows] });
          } else requestAnimationFrame(watch);
        };
        watch();
      }),
  );

  expect(frames.wings).toContain("flying blur");
  expect(frames.wings).toContain("immobility rest");
  expect(frames.wings).toContain("walking rest");
  for (const pair of frames.wings) {
    expect(pair.endsWith("blur")).toBe(pair.startsWith("flying"));
  }
  expect(frames.shadows).toContain("off floor true, visible true, below true");
  for (const shadow of frames.shadows) {
    expect(
      shadow.startsWith("off floor false") || shadow.endsWith("visible true, below true"),
    ).toBe(true);
  }
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
  const sample = await currentSample(page);
  if (!sample) throw new Error("expected a sample");
  expect(flyFeet).toHaveLength(6);
  // The engine has z up and the scene has y up, and the fly may be on any surface.
  const { position, up } = sample;
  for (const foot of flyFeet) {
    const height =
      (foot.x - position.x) * up.x + (foot.z - position.y) * up.y + (foot.y - position.z) * up.z;
    expect(height).toBeCloseTo(0, 6);
  }
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
