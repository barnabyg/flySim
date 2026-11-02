import { expect, test } from "@playwright/test";
import { currentSample, openApp } from "./helpers";

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
  // A seed that flies early, so a flight comes within the time allowed.
  await openApp(page, 43);
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

test("the fly's feet never go through a surface as it crosses edges", async ({ page }) => {
  // A small Room makes for many edges, and a low speed shows the frames around each crossing.
  await page.goto("/?seed=3&width=0.1&depth=0.1&height=0.1&speed=5");
  await expect.poll(() => currentSample(page).then(Boolean), { timeout: 30_000 }).toBe(true);

  const { surfaces, worstOutside } = await page.evaluate(
    () =>
      new Promise<{ surfaces: string[]; worstOutside: number }>((resolve) => {
        const surfaces = new Set<string>();
        let worstOutside = 0;
        const started = performance.now();
        const watch = (): void => {
          const surface = window.flySim.current()?.surface;
          if (surface) surfaces.add(surface);
          for (const { x, y, z } of window.flySim.view().flyFeet) {
            worstOutside = Math.max(worstOutside, -x, -y, -z, x - 0.1, y - 0.1, z - 0.1);
          }
          if (surfaces.size >= 4 || performance.now() - started > 40_000) {
            resolve({ surfaces: [...surfaces], worstOutside });
          } else requestAnimationFrame(watch);
        };
        watch();
      }),
  );

  expect(surfaces.length).toBeGreaterThanOrEqual(3);
  expect(worstOutside).toBeLessThan(1e-5);
});
