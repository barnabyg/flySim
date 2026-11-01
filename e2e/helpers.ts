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

interface ScreenshotAnalysis {
  readonly distinctColours: number;
  readonly ringPixels: number;
  readonly darkPixels: number;
}

/** Analyses a screenshot in the page, as passing every pixel back to the test is very slow. */
async function analyse(page: Page, png: Buffer): Promise<ScreenshotAnalysis> {
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
    let ringPixels = 0;
    let darkPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      colours.add((r << 16) | (g << 8) | b);
      // The Room is close to grey, so a strong warm tint can only be the ring.
      if (r > 150 && r - b > 50) ringPixels += 1;
      if (r < 90 && g < 70 && b < 60 && r > b) darkPixels += 1;
    }
    return { distinctColours: colours.size, ringPixels, darkPixels };
  }, png.toString("base64"));
}

/** Counts the distinct colours in a screenshot of an element. */
export async function distinctColours(page: Page, selector: string): Promise<number> {
  return (await analyse(page, await page.locator(selector).screenshot())).distinctColours;
}

/** Counts pixels in a page region, from a screenshot of what's really on screen. */
export async function countPixels(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
  kind: "ring" | "dark",
): Promise<number> {
  const analysis = await analyse(page, await page.screenshot({ clip }));
  return kind === "ring" ? analysis.ringPixels : analysis.darkPixels;
}
