import { expect, test, type Page } from "@playwright/test";
import type { RunRecord } from "../src/engine";
import { currentSample, currentTime, drag, openApp, runRecord, sources } from "./helpers";

/** Pauses the run once it is past a time, and returns its record. */
async function pausedAfter(page: Page, seconds: number): Promise<RunRecord> {
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(seconds);
  await page.locator("#pause").click();
  // A frame or two may still be on its way.
  await page.waitForTimeout(200);
  return runRecord(page);
}

/** Replays the run and waits for the replay to reach the step a record reached. */
async function replayTo(page: Page, step: number): Promise<RunRecord> {
  await page.locator("#replay").click();
  // A replay starts again from zero, so the clock falling shows that it has started.
  await expect
    .poll(async () => (await currentSample(page))?.step ?? Infinity, { intervals: [20] })
    .toBeLessThan(step);
  await expect
    .poll(async () => (await currentSample(page))?.step ?? 0, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(step);
  return runRecord(page);
}

/** What happened up to a step, which a replay reaching that step must repeat exactly. */
function upTo(record: RunRecord, step: number) {
  return {
    samples: record.samples.filter((each) => each.step <= step),
    fired: record.firedTransitions.filter((each) => each.step <= step),
    interventions: record.interventions.filter((each) => each.step <= step),
  };
}

test("Replay is an icon button beside Restart", async ({ page }) => {
  await openApp(page);
  const replay = page.locator("#replay");
  await expect(replay.locator("svg")).toBeVisible();
  await expect(replay).toHaveText("");
  await expect(replay).toHaveAccessibleName("Replay with everything changed");
  await expect(replay).toHaveAttribute("title", /Replay/);
  await expect(page.locator("#restart + #replay")).toHaveCount(1);
});

test("a replay repeats a Disturb, a schedule change and a moved source, at another speed", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openApp(page, 42);
  await expect.poll(() => currentTime(page)).toBeGreaterThan(20);
  await page.locator("#disturb").click();
  await page.locator("#light-settings summary").click();
  await page.locator("#always-off").click();
  await drag(page, "food", { x: 120, y: -60 });
  const original = await pausedAfter(page, 150);
  expect(original.interventions.map((each) => each.type)).toEqual([
    "disturb",
    "light-schedule",
    "move-source",
  ]);
  const moved = original.samples.at(-1)?.food;

  await page.locator("#speed").fill("9");
  await expect(page.locator("#speed-readout")).toHaveText("600×");
  const replayed = await replayTo(page, original.step);

  // The replay is at the new speed, and its URL keeps it.
  await expect(page.locator("#speed-readout")).toHaveText("600×");
  expect(page.url()).toContain("speed=600");
  expect(upTo(replayed, original.step)).toEqual(upTo(original, original.step));
  // It shows what was changed, as it was live.
  expect((await sources(page)).food?.place).toEqual(moved);
  expect((await currentSample(page))?.lightSchedule.lightHours).toBe(0);
  expect(
    await page.evaluate(() =>
      Number(document.querySelector("#ribbon")?.getAttribute("data-marks")),
    ),
  ).toBeGreaterThanOrEqual(1);
});

test("Interventions made during a replay add to it, and Restart drops them all", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openApp(page, 7);
  await expect.poll(() => currentTime(page)).toBeGreaterThan(20);
  await page.locator("#disturb").click();
  const first = await pausedAfter(page, 60);
  await replayTo(page, first.step);

  await page.locator("#water-presence").click();
  await expect(page.locator("#water-presence")).toHaveAccessibleName("Put the water back");
  const second = await pausedAfter(page, 120);
  expect(second.interventions.map((each) => each.type)).toEqual(["disturb", "remove-source"]);
  expect(second.interventions[0]).toEqual(first.interventions[0]);

  const again = await replayTo(page, second.step);
  expect(upTo(again, second.step)).toEqual(upTo(second, second.step));
  // The replayed removal shows on its button, as it did live.
  await expect(page.locator("#water-presence")).toHaveAccessibleName("Put the water back");

  await page.locator("#restart").click();
  await expect.poll(() => currentTime(page), { intervals: [20] }).toBeLessThan(60);
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(120);
  expect((await runRecord(page)).interventions).toEqual([]);
  await expect(page.locator("#water-presence")).toHaveAccessibleName("Remove the water");
});
