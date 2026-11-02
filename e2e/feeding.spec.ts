import { expect, test, type Page } from "@playwright/test";
import { BEHAVIOUR_COLOURS } from "../src/viewer/palette";
import { currentSample, openApp, runRecord } from "./helpers";

/** Opens a run whose food is right under the fly's starting place, so it feeds at once. */
async function openOnFood(page: Page, seed: number, speed = 60): Promise<void> {
  await openApp(page, seed);
  const start = (await runRecord(page)).samples[0]?.position;
  if (!start) throw new Error("no first sample");
  await page.goto(`/?seed=${seed}&speed=${speed}&food=${start.x},${start.y}`);
  await expect.poll(() => currentSample(page).then(Boolean), { timeout: 30_000 }).toBe(true);
}

/** Counts pixels the food's straw yellow, which neither the amber ring nor the Room can be. */
async function foodPixels(page: Page, selector: string): Promise<number> {
  const png = await page.locator(selector).screenshot();
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
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      if (r > 110 && g > 0.82 * r && g < 1.05 * r && b < 0.6 * g) count += 1;
    }
    return count;
  }, png.toString("base64"));
}

test("the food is drawn on the floor, in the main view and the close-up", async ({ page }) => {
  await openOnFood(page, 42, 2);
  await expect
    .poll(async () => (await currentSample(page))?.behaviour, { timeout: 30_000 })
    .toBe("feeding");
  await page.locator("#pause").click();

  await expect.poll(() => foodPixels(page, "#scene")).toBeGreaterThan(200);
  // The fly is feeding on the food, so the close-up looks down onto it.
  await page.locator("#inset").click();
  await expect.poll(() => foodPixels(page, "#scene")).toBeGreaterThan(10_000);
});

test("Feeding shows in the bars, flashes, ribbon and the fly itself", async ({ page }) => {
  await openOnFood(page, 42, 2);
  await expect
    .poll(async () => (await currentSample(page))?.behaviour, { timeout: 30_000 })
    .toBe("feeding");
  await page.locator("#pause").click();

  const frame = await page.evaluate(() => {
    const sample = window.flySim.current();
    const state = sample?.transitions.find((each) => each.transition === "feeding-to-immobility");
    const row = document.querySelector<HTMLElement>('[data-transition="feeding-to-immobility"]');
    return {
      sample,
      state,
      available: row?.dataset["available"],
      fullHazard: Number(row?.dataset["fullHazard"]),
      hungerWidth: parseFloat(
        row?.querySelector<HTMLElement>('[data-driver="hunger"]')?.style.width ?? "NaN",
      ),
      strip: parseFloat(row?.querySelector<HTMLElement>(".strip")?.style.opacity ?? "NaN"),
      flashes: window.flySim.flashes(),
      pose: window.flySim.view().flyPose,
    };
  });
  if (!frame.state || !frame.sample) throw new Error("no feeding state");

  expect(frame.available).toBe("true");
  expect(frame.hungerWidth).toBeCloseTo(
    (100 * frame.state.contributions.hunger) / frame.fullHazard,
    3,
  );
  expect(frame.strip).toBeCloseTo(frame.state.fireProbabilityNextMinute, 6);
  expect(frame.flashes.some((flash) => flash.transition.endsWith("-to-feeding"))).toBe(true);
  expect(frame.pose).toEqual({ behaviour: "feeding", wings: "rest", proboscis: "extended" });
  expect(frame.sample.senses.touchingFood).toBe(true);

  await page.locator('[data-transition="feeding-to-immobility"]').hover();
  await expect(page.locator(".tooltip")).toContainText("Hunger");

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
  }, BEHAVIOUR_COLOURS.feeding);
  expect(ribbon).toBeGreaterThan(0);
});

test("a feeding fly stays on the food with its legs still", async ({ page }) => {
  await openOnFood(page, 42, 2);
  await expect
    .poll(async () => (await currentSample(page))?.behaviour, { timeout: 30_000 })
    .toBe("feeding");
  const frame = () =>
    page.evaluate(() => ({
      behaviour: window.flySim.current()?.behaviour,
      position: window.flySim.flyScenePosition(),
      feet: window.flySim.view().flyFeet,
    }));
  const before = await frame();
  await page.waitForTimeout(400);
  const after = await frame();
  if (after.behaviour !== "feeding") test.skip(true, "the bout ended while watching");

  expect(after.position).toEqual(before.position);
  expect(after.feet).toEqual(before.feet);
});
