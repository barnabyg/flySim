import { expect, test, type Page } from "@playwright/test";
import { BEHAVIOUR_COLOURS } from "../src/viewer/palette";
import { currentSample, openApp, runRecord } from "./helpers";

/** Opens a run whose water is right under the fly's starting place, so it drinks at once. */
async function openOnWater(page: Page, seed: number, speed: number): Promise<void> {
  await openApp(page, seed);
  const start = (await runRecord(page)).samples[0]?.position;
  if (!start) throw new Error("no first sample");
  await page.goto(`/?seed=${seed}&speed=${speed}&water=${start.x},${start.y}`);
  await expect
    .poll(async () => (await currentSample(page))?.behaviour, { timeout: 30_000 })
    .toBe("drinking");
}

/** Counts pixels of the water's blue and the food's straw yellow, which are easy to tell apart. */
async function sourcePixels(page: Page): Promise<{ water: number; food: number }> {
  const png = await page.locator("#scene").screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let water = 0;
    let food = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      if (b > 120 && b > r + 50 && b > g + 15) water += 1;
      if (r > 110 && g > 0.82 * r && g < 1.05 * r && b < 0.6 * g) food += 1;
    }
    return { water, food };
  }, png.toString("base64"));
}

test("the water is drawn on the floor apart from the food, in both views", async ({ page }) => {
  await openOnWater(page, 42, 2);
  await page.locator("#pause").click();

  await expect.poll(async () => (await sourcePixels(page)).water).toBeGreaterThan(200);
  // The food is in the far corner, so it is smaller on screen.
  expect((await sourcePixels(page)).food).toBeGreaterThan(50);
  // The fly is drinking on the water, so the close-up looks down onto it, and not onto food.
  await page.locator("#inset").click();
  await expect.poll(async () => (await sourcePixels(page)).water).toBeGreaterThan(10_000);
  expect((await sourcePixels(page)).food).toBeLessThan(100);
});

test("Drinking shows in the bars, flashes, ribbon and the fly itself", async ({ page }) => {
  await openOnWater(page, 42, 2);
  await page.locator("#pause").click();

  const frame = await page.evaluate(() => {
    const sample = window.flySim.current();
    const state = sample?.transitions.find((each) => each.transition === "drinking-to-immobility");
    const row = document.querySelector<HTMLElement>('[data-transition="drinking-to-immobility"]');
    return {
      sample,
      state,
      available: row?.dataset["available"],
      fullHazard: Number(row?.dataset["fullHazard"]),
      thirstWidth: parseFloat(
        row?.querySelector<HTMLElement>('[data-driver="thirst"]')?.style.width ?? "NaN",
      ),
      strip: parseFloat(row?.querySelector<HTMLElement>(".strip")?.style.opacity ?? "NaN"),
      flashes: window.flySim.flashes(),
      pose: window.flySim.view().flyPose,
    };
  });
  if (!frame.state || !frame.sample) throw new Error("no drinking state");

  expect(frame.available).toBe("true");
  expect(frame.thirstWidth).toBeCloseTo(
    (100 * frame.state.contributions.thirst) / frame.fullHazard,
    3,
  );
  expect(frame.strip).toBeCloseTo(frame.state.fireProbabilityNextMinute, 6);
  expect(frame.flashes.some((flash) => flash.transition.endsWith("-to-drinking"))).toBe(true);
  expect(frame.pose).toEqual({ behaviour: "drinking", wings: "rest", proboscis: "extended" });
  expect(frame.sample.senses.touchingWater).toBe(true);

  await page.locator('[data-transition="drinking-to-immobility"]').hover();
  await expect(page.locator(".tooltip")).toContainText("Thirst");

  const ribbon = await page.evaluate((colour) => {
    const canvas = document.querySelector<HTMLCanvasElement>("#ribbon");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) throw new Error("No ribbon");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === r && data[i + 1] === g && data[i + 2] === b) count += 1;
    }
    return count;
  }, BEHAVIOUR_COLOURS.drinking);
  expect(ribbon).toBeGreaterThan(0);
});

test("a drinking fly stays on the water with its legs still", async ({ page }) => {
  await openOnWater(page, 42, 2);
  const frame = () =>
    page.evaluate(() => ({
      behaviour: window.flySim.current()?.behaviour,
      position: window.flySim.flyScenePosition(),
      feet: window.flySim.view().flyFeet,
    }));
  const before = await frame();
  await page.waitForTimeout(400);
  const after = await frame();
  if (after.behaviour !== "drinking") test.skip(true, "the bout ended while watching");

  expect(after.position).toEqual(before.position);
  expect(after.feet).toEqual(before.feet);
});
