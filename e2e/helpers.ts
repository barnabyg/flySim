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

/** Counts pixels in a page region, from a screenshot of what's really on screen. */
export async function countPixels(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
  kind: "ring" | "dark",
): Promise<number> {
  const png = await page.screenshot({ clip });
  return page.evaluate(
    async ({ base64, kind }) => {
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
        // The Room is close to grey, so a strong warm tint can only be the ring.
        if (kind === "ring" && r > 150 && r - b > 50) count += 1;
        if (kind === "dark" && r < 90 && g < 70 && b < 60 && r > b) count += 1;
      }
      return count;
    },
    { base64: png.toString("base64"), kind },
  );
}
