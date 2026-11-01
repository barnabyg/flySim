import { expect, type Page } from "@playwright/test";
import type { RunRecord, RunSample } from "../src/engine";

export async function openApp(page: Page, seed = 42): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await expect.poll(() => currentSample(page).then(Boolean)).toBe(true);
}

export async function currentSample(page: Page): Promise<RunSample | undefined> {
  // The app may not have loaded yet, so flySim may not exist.
  return page.evaluate(() => (window as Partial<Window>).flySim?.current());
}

export async function currentTime(page: Page): Promise<number> {
  return (await currentSample(page))?.timeSeconds ?? 0;
}

export async function runRecord(page: Page): Promise<RunRecord> {
  return page.evaluate(() => window.flySim.record());
}

/** Counts the distinct colours in a screenshot of an element, decoded in the page. */
export async function distinctColours(page: Page, selector: string): Promise<number> {
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
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      colours.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    }
    return colours.size;
  }, png.toString("base64"));
}
