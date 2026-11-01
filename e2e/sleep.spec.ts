import { expect, test, type Page } from "@playwright/test";
import { currentSample } from "./helpers";

/** Pauses a run at high speed with the fly asleep, trying again if it woke before the pause. */
async function pauseWhileAsleep(page: Page): Promise<void> {
  await expect(async () => {
    await expect
      .poll(async () => (await currentSample(page))?.behaviour, {
        timeout: 45_000,
        intervals: [20],
      })
      .toBe("sleeping");
    await page.locator("#pause").click();
    await page.waitForTimeout(200);
    if ((await currentSample(page))?.behaviour !== "sleeping") {
      await page.locator("#pause").click();
      throw new Error("woke before the pause");
    }
  }).toPass({ timeout: 50_000 });
}

test("the ribbon and hover numbers tell light sleep from deep sleep", async ({ page }) => {
  await page.goto("/?seed=4&speed=1000");
  await expect.poll(() => currentSample(page).then(Boolean), { timeout: 30_000 }).toBe(true);
  await expect
    .poll(async () => (await currentSample(page))?.timeSeconds, { timeout: 45_000 })
    .toBeGreaterThan(8 * 3600);
  await pauseWhileAsleep(page);

  const row = page.locator('[data-transition="sleeping-to-immobility"]');
  await row.hover();
  await expect(page.locator(".tooltip")).toContainText("Sleep Depth");
  const depth = (await currentSample(page))?.sleepDepth ?? NaN;
  await expect(page.locator(".tooltip")).toContainText(depth.toFixed(2));

  const shades = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#ribbon");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) throw new Error("No ribbon");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const found = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      found.add(
        [data[i], data[i + 1], data[i + 2]]
          .map((value) => (value ?? 0).toString(16).padStart(2, "0"))
          .join(""),
      );
    }
    return ["b9a9f4", "8f78e6", "6a50c8", "4a30a0"].filter((shade) => found.has(shade));
  });
  expect(shades.length).toBeGreaterThanOrEqual(2);
});

test("the fly falls asleep, its row responds and the ribbon shows sleep in its own colour", async ({
  page,
}) => {
  await page.goto("/?seed=4&speed=1000");
  await expect.poll(() => currentSample(page).then(Boolean), { timeout: 30_000 }).toBe(true);

  // Waits in the page, so the state and display are read together, however short the bout.
  const row = await page.evaluate(
    () =>
      new Promise<{ available?: string; sleepPressureWidth: number }>((resolve) => {
        const watch = (): void => {
          if (window.flySim.current()?.behaviour !== "sleeping") {
            requestAnimationFrame(watch);
            return;
          }
          const element = document.querySelector<HTMLElement>(
            '[data-transition="sleeping-to-immobility"]',
          );
          const segment = element?.querySelector<HTMLElement>('[data-driver="sleepPressure"]');
          const available = element?.dataset["available"];
          resolve({
            ...(available === undefined ? {} : { available }),
            sleepPressureWidth: parseFloat(segment?.style.width ?? "NaN"),
          });
        };
        watch();
      }),
  );
  expect(row.available).toBe("true");
  expect(row.sleepPressureWidth).toBeGreaterThan(0);

  await page.locator("#pause").click();
  await page.waitForTimeout(300);
  const hasSleepColour = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#ribbon");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) throw new Error("No ribbon");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      // Any violet, as distinct from Immobility's blue and from the other behaviours.
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      if (b > 120 && r > 1.05 * g && b > 1.3 * r) return true;
    }
    return false;
  });
  expect(hasSleepColour).toBe(true);
});
