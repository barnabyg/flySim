import { expect, test, type Page } from "@playwright/test";
import { currentSample, currentTime, openApp, runRecord } from "./helpers";

/** The widest the startle segment gets in any row, and how the ribbon shows marks. */
async function display(page: Page) {
  return page.evaluate(() => {
    const widths = [...document.querySelectorAll<HTMLElement>('[data-driver="startle"]')].map(
      (segment) => parseFloat(segment.style.width),
    );
    const canvas = document.querySelector<HTMLCanvasElement>("#ribbon");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) throw new Error("No ribbon");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let whitePixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) whitePixels += 1;
    }
    return {
      startleWidth: Math.max(...widths),
      marks: Number(canvas.dataset["marks"]),
      whitePixels,
    };
  });
}

test("Disturb is an icon button that adds an intervention and makes the display respond", async ({
  page,
}) => {
  await openApp(page);
  await expect(page.locator("#disturb svg")).toBeVisible();
  await expect(page.locator("#disturb")).toHaveText("");
  await expect(page.locator("#disturb")).toHaveAccessibleName("Disturb");

  await expect.poll(() => currentTime(page)).toBeGreaterThan(30);
  const before = await display(page);
  expect(before.startleWidth).toBe(0);
  expect(before.marks).toBe(0);

  await page.locator("#disturb").click();

  // The bar is held long enough for a person, and so for this poll, to see it at 60×.
  await expect.poll(async () => (await display(page)).startleWidth).toBeGreaterThan(20);
  await expect.poll(async () => (await display(page)).marks).toBe(1);
  await expect.poll(async () => (await display(page)).whitePixels).toBeGreaterThan(0);

  const { interventions } = await runRecord(page);
  expect(interventions).toHaveLength(1);
  expect(interventions[0]?.type).toBe("disturb");
  const [first] = interventions;
  expect(first?.step).toBeGreaterThan(0);
  await expect
    .poll(async () => (await runRecord(page)).samples.some((sample) => sample.startle > 0))
    .toBe(true);

  // The bar's hold ends once the startle has faded.
  await expect.poll(async () => (await display(page)).startleWidth).toBe(0);
});

test("pressing Disturb while paused takes effect when time resumes", async ({ page }) => {
  await openApp(page);
  await page.locator("#pause").click();
  await page.waitForTimeout(300);
  const paused = await currentSample(page);
  if (!paused) throw new Error("no sample");

  await page.locator("#disturb").click();
  await expect.poll(async () => (await runRecord(page)).interventions).toHaveLength(1);

  const { interventions } = await runRecord(page);
  expect(interventions[0]?.step).toBe(paused.step);
  await expect.poll(async () => (await display(page)).marks).toBe(1);
  const stillPaused = await currentSample(page);
  expect(stillPaused?.step).toBe(paused.step);
  expect(stillPaused?.startle).toBe(0);

  await page.locator("#pause").click();
  await expect
    .poll(async () => (await runRecord(page)).samples.some((sample) => sample.startle > 0))
    .toBe(true);
});

test("restarting with the same seed gives the run without any Disturb presses", async ({
  page,
}) => {
  await openApp(page, 123);
  await expect.poll(() => currentTime(page)).toBeGreaterThan(30);
  await page.locator("#disturb").click();
  await expect.poll(async () => (await runRecord(page)).interventions).toHaveLength(1);

  await page.locator("#restart").click();
  await expect
    .poll(async () => (await currentSample(page))?.timeSeconds ?? Infinity, { intervals: [20] })
    .toBeLessThan(30);

  expect((await runRecord(page)).interventions).toEqual([]);
  expect((await display(page)).marks).toBe(0);
});
