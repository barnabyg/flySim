import { expect, test, type Page } from "@playwright/test";
import { currentSample, currentTime, openApp, runRecord } from "./helpers";

/** A restart loads the page again, so this waits for the new run's first frame. */
async function waitForRunAt(page: Page, url: RegExp): Promise<void> {
  await page.waitForURL(url);
  await expect.poll(() => currentSample(page).then(Boolean)).toBe(true);
}

async function firstSeconds(page: Page, seconds: number) {
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(seconds);
  const record = await runRecord(page);
  return {
    seed: record.seed,
    samples: record.samples.filter((sample) => sample.timeSeconds <= seconds),
    fired: record.firedTransitions.filter((fired) => fired.timeSeconds <= seconds),
  };
}

test("restarting with the same seed reproduces the run", async ({ page }) => {
  await openApp(page, 123);
  const first = await firstSeconds(page, 120);
  expect(first.fired.length).toBeGreaterThan(0);

  await page.locator("#restart").click();
  // A restarted run starts again from zero, so the clock falling shows the restart happened.
  await expect.poll(() => currentTime(page), { intervals: [20] }).toBeLessThan(100);

  expect(await firstSeconds(page, 120)).toEqual(first);
});

test("restarting with a new seed gives a different run", async ({ page }) => {
  await openApp(page, 123);
  const first = await firstSeconds(page, 60);

  await page.locator("#new-seed").click();
  await waitForRunAt(page, /seed=(?!123&)/);

  const second = await firstSeconds(page, 60);
  expect(second.seed).not.toBe(first.seed);
  expect(second.samples).not.toEqual(first.samples);
});

test("restarting keeps the chosen time speed", async ({ page }) => {
  await openApp(page, 123);
  await page.locator("#speed").fill("9");
  await expect(page.locator("#speed-readout")).toHaveText("600×");

  await page.locator("#restart").click();
  await expect(page.locator("#speed-readout")).toHaveText("600×");
  await expect.poll(() => currentTime(page)).toBeGreaterThan(30);
});

test("the Room's size can be changed, and the fly stays within the new Room", async ({ page }) => {
  await openApp(page, 123);
  expect((await runRecord(page)).room).toEqual({
    widthMetres: 1,
    depthMetres: 1,
    heightMetres: 0.6,
  });

  await page.locator("#room-settings summary").click();
  await page.locator("#room-width").fill("0.3");
  await page.locator("#room-depth").fill("0.5");
  await page.locator("#room-height").fill("0.2");
  await page.locator("#room-apply").click();

  await waitForRunAt(page, /width=0\.3&/);
  expect((await runRecord(page)).room).toEqual({
    widthMetres: 0.3,
    depthMetres: 0.5,
    heightMetres: 0.2,
  });
  expect(await page.evaluate(() => window.flySim.seed)).toBe(123);

  // The whole new Room is framed, not just the size in the record.
  const { roomCornersInMainView } = await page.evaluate(() => window.flySim.view());
  for (const corner of roomCornersInMainView) {
    expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(corner.y)).toBeLessThanOrEqual(1);
  }

  await page.locator("#speed").fill("10");
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(300);
  const { samples, timeInBehaviourSeconds } = await runRecord(page);
  expect(timeInBehaviourSeconds.flying).toBeGreaterThan(0);
  for (const { position } of samples) {
    expect(position.x).toBeGreaterThanOrEqual(0);
    expect(position.x).toBeLessThanOrEqual(0.3);
    expect(position.y).toBeGreaterThanOrEqual(0);
    expect(position.y).toBeLessThanOrEqual(0.5);
    expect(position.z).toBeGreaterThanOrEqual(0);
    expect(position.z).toBeLessThanOrEqual(0.2);
  }
});

test("the fly's feet never go through a surface as it crosses edges", async ({ page }) => {
  // A small Room makes for many edges, and a low speed shows the frames around each crossing.
  await page.goto("/?seed=3&width=0.1&depth=0.1&height=0.1&speed=5");
  await expect.poll(() => currentSample(page).then(Boolean)).toBe(true);

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

test("a Room size outside the allowed range falls back to a size that works", async ({ page }) => {
  await page.goto("/?seed=1&width=0.0001&depth=nonsense&height=900");
  await expect.poll(() => page.evaluate(() => window.flySim.current() !== undefined)).toBe(true);
  expect((await runRecord(page)).room).toEqual({
    widthMetres: 0.1,
    depthMetres: 1,
    heightMetres: 5,
  });
});
