import { expect, type Page } from "@playwright/test";
import type { Behaviour, RunRecord, RunSample, SourceKind } from "../src/engine";

export async function openApp(page: Page, seed = 42): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await expect.poll(() => currentSample(page).then(Boolean), { timeout: 30_000 }).toBe(true);
}

export async function currentSample(page: Page): Promise<RunSample | undefined> {
  // The app may not have loaded yet, so flySim may not exist, and a restart or replay may be
  // loading the page again.
  try {
    return await page.evaluate(() => (window as Partial<Window>).flySim?.current());
  } catch (error) {
    if (String(error).includes("Execution context was destroyed")) return undefined;
    throw error;
  }
}

export async function currentTime(page: Page): Promise<number> {
  return (await currentSample(page))?.timeSeconds ?? 0;
}

export async function runRecord(page: Page): Promise<RunRecord> {
  return page.evaluate(() => window.flySim.record());
}

/**
 * How many Interventions the run has, counted in the page, as passing a whole record back to the
 * test takes seconds once a run is long or the machine is busy.
 */
export async function interventionCount(page: Page): Promise<number> {
  return page.evaluate(async () => (await window.flySim.record()).interventions.length);
}

export async function sources(page: Page) {
  return page.evaluate(() => window.flySim.sources());
}

/** Drags a source by the given number of pixels in the main view, in small steps. */
export async function drag(
  page: Page,
  kind: SourceKind,
  by: { x: number; y: number },
): Promise<void> {
  const start = (await sources(page))[kind]?.client;
  if (!start) throw new Error(`${kind} isn't showing`);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 10 });
  await page.mouse.up();
}

/** What the fly looks like in one frame, and the latest step when it was taken. */
interface FlyFrame {
  readonly step: number;
  readonly behaviour: Behaviour;
  readonly position: { x: number; y: number; z: number };
  readonly feet: readonly { x: number; y: number; z: number }[];
}

async function flyFrame(page: Page): Promise<FlyFrame> {
  return page.evaluate(() => ({
    step: window.flySim.current()?.step ?? -1,
    behaviour: window.flySim.view().flyPose.behaviour,
    position: window.flySim.flyScenePosition(),
    feet: window.flySim.view().flyFeet,
  }));
}

/**
 * Takes two frames 400 ms apart within one bout of a behaviour, so it returns frames from one bout
 * or fails. If the bout ends between them, it reloads the run and tries again, so the run must
 * start the bout soon after it loads, as one on the food or water does.
 */
export async function twoFramesInOneBout(
  page: Page,
  behaviour: Behaviour,
): Promise<{ before: FlyFrame; after: FlyFrame }> {
  let frames: { before: FlyFrame; after: FlyFrame } | undefined;
  let attempts = 0;
  await expect(async () => {
    attempts += 1;
    if (attempts > 1) await page.reload();
    await expect
      .poll(async () => (await currentSample(page))?.behaviour, { timeout: 20_000 })
      .toBe(behaviour);
    const before = await flyFrame(page);
    await page.waitForTimeout(400);
    const after = await flyFrame(page);
    expect([before.behaviour, after.behaviour]).toEqual([behaviour, behaviour]);
    expect(after.step).toBeGreaterThan(before.step);
    // The bout the second frame shows began before the first frame, so both are in it.
    const { firedTransitions } = await runRecord(page);
    const bout = firedTransitions.filter((each) => each.step <= after.step).at(-1);
    expect(bout?.to).toBe(behaviour);
    expect(bout?.step).toBeLessThan(before.step);
    frames = { before, after };
  }).toPass({ timeout: 40_000 });
  if (!frames) throw new Error("no frames");
  return frames;
}

interface ScreenshotAnalysis {
  readonly distinctColours: number;
  readonly ringPixels: number;
  readonly darkPixels: number;
  readonly meanBrightness: number;
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
    let brightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      colours.add((r << 16) | (g << 8) | b);
      brightness += (r + g + b) / 3;
      // The ring is about (241, 178, 64) over the lit Room and (216, 155, 47) over the dim one.
      // The Room is close to grey and the fly's browns and reds are duller, so a colour this
      // bright can only be the ring.
      if (r > 200 && g > 140 && b < 100) ringPixels += 1;
      if (r < 90 && g < 70 && b < 60 && r > b) darkPixels += 1;
    }
    return {
      distinctColours: colours.size,
      ringPixels,
      darkPixels,
      meanBrightness: brightness / (data.length / 4),
    };
  }, png.toString("base64"));
}

/** Counts the distinct colours in a screenshot of an element. */
export async function distinctColours(page: Page, selector: string): Promise<number> {
  return (await analyse(page, await page.locator(selector).screenshot())).distinctColours;
}

/** How bright a screenshot of an element is on average, from 0 to 255. */
export async function meanBrightness(page: Page, selector: string): Promise<number> {
  return (await analyse(page, await page.locator(selector).screenshot())).meanBrightness;
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
