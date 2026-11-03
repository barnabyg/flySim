import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzipSync, gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import type { RunExport, RunRecord } from "../src/engine";
import { currentSample, currentTime, drag, openApp, runRecord } from "./helpers";

async function exportJson(page: Page): Promise<RunExport> {
  await page.locator("#export-settings summary").click();
  const download = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const text = gunzipSync(await readFile(await (await download).path())).toString("utf8");
  return JSON.parse(text) as RunExport;
}

/** Opens a file, as if chosen in the open control's dialog. */
async function openFile(page: Page, name: string, contents: Buffer): Promise<void> {
  await page
    .locator("#open-file")
    .setInputFiles({ name, mimeType: "application/gzip", buffer: contents });
}

/** Waits for the run that opening a file starts to reach a step, and returns its record. */
async function replayedTo(page: Page, seed: number, step: number): Promise<RunRecord> {
  await expect
    .poll(
      () => page.evaluate(() => (window as Partial<Window>).flySim?.seed).catch(() => undefined),
      {
        timeout: 30_000,
      },
    )
    .toBe(seed);
  await expect
    .poll(async () => (await currentSample(page))?.step ?? 0, { timeout: 60_000 })
    .toBeGreaterThanOrEqual(step);
  return runRecord(page);
}

/** As a file holds it, where JSON has written -0 as 0. */
function asSaved<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** That a run's record repeats an exported run, up to the step the export reached. */
function expectSameRun(record: RunRecord, file: RunExport): void {
  expect(record.seed).toBe(file.seed);
  expect(record.parameters).toEqual(file.parameters);
  expect(asSaved(record.firedTransitions.filter((each) => each.step <= file.step))).toEqual(
    file.firedTransitions,
  );
  expect(record.interventions.filter((each) => each.step <= file.step)).toEqual(file.interventions);
  const byStep = new Map(record.samples.map((sample) => [sample.step, sample]));
  for (const sample of file.samples) expect(asSaved(byStep.get(sample.step))).toEqual(sample);
}

test("the open control loads an exported run with Interventions and replays it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openApp(page, 31);
  await expect(page.locator("#open svg")).toBeVisible();
  await expect(page.locator("#open")).toHaveAccessibleName("Open an exported run");
  await expect.poll(() => currentTime(page)).toBeGreaterThan(20);
  await page.locator("#disturb").click();
  await drag(page, "water", { x: -100, y: 30 });
  await expect.poll(() => currentTime(page)).toBeGreaterThan(80);
  await page.locator("#pause").click();
  const file = await exportJson(page);
  expect(file.interventions.map((each) => each.type)).toEqual(["disturb", "move-source"]);

  // A different run first, so that opening the file plainly changes what is running.
  await page.goto("/?seed=5&speed=600");
  await expect.poll(() => currentSample(page).then(Boolean)).toBe(true);
  await openFile(page, "run.json.gz", gzipSync(JSON.stringify(file)));
  const opened = await replayedTo(page, 31, file.step);
  expectSameRun(opened, file);
  // The URL follows the opened run, and keeps the time speed.
  expect(page.url()).toContain("seed=31");
  expect(page.url()).toContain("speed=600");

  // Interventions made after opening add to it, and Replay keeps them all. A key press disturbs
  // once, where a slow mouse press could repeat. The run is paused so its record stays small.
  await page.locator("#pause").click();
  await page.locator("#disturb").press("Enter");
  await expect
    .poll(() => page.evaluate(async () => (await window.flySim.record()).interventions.length))
    .toBe(3);
  const withMore = await runRecord(page);
  await page.locator("#replay").click();
  await expect
    .poll(async () => (await currentSample(page))?.step ?? Infinity, { intervals: [20] })
    .toBeLessThan(withMore.step);
  await expect
    .poll(async () => (await currentSample(page))?.step ?? 0, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(withMore.step);
  const replayed = await runRecord(page);
  expect(replayed.interventions.filter((each) => each.step <= withMore.step)).toEqual(
    withMore.interventions,
  );
  expect(replayed.firedTransitions.filter((each) => each.step <= withMore.step)).toEqual(
    withMore.firedTransitions,
  );
});

test("a batch seed's export opens in the viewer and gives the same run", async ({ page }) => {
  test.setTimeout(120_000);
  const out = await mkdtemp(join(tmpdir(), "fly-sim-open-"));
  try {
    await promisify(execFile)(process.execPath, [
      "--import",
      new URL("../src/batch/resolveTypeScript.ts", import.meta.url).href,
      new URL("../src/batch/cli.ts", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
      ...["--seeds", "9-9", "--duration", "5m", "--sample-interval", "5", "--out", out],
      ...["--width", "0.6", "--depth", "0.7", "--food", "0.2,0.3", "--hydration", "0.4"],
    ]);
    const [name] = (await readdir(join(out, "seeds"))).filter((each) => each.endsWith(".json.gz"));
    if (!name) throw new Error("the batch wrote no JSON");
    const contents = await readFile(join(out, "seeds", name));
    const file = JSON.parse(gunzipSync(contents).toString("utf8")) as RunExport;

    await page.goto("/?seed=5&speed=600");
    await expect.poll(() => currentSample(page).then(Boolean)).toBe(true);
    await openFile(page, name, contents);
    expectSameRun(await replayedTo(page, 9, file.step), file);
    expect(page.url()).toMatch(/seed=9&width=0\.6&depth=0\.7&height=0\.6&speed=600/);
    expect(page.url()).toContain("hydration=0.4");
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test("files that can't be replayed as they are are refused or need confirming", async ({
  page,
}) => {
  await openApp(page, 12);
  await expect.poll(() => currentTime(page)).toBeGreaterThan(10);
  const file = await exportJson(page);
  const messages: string[] = [];
  let accept = false;
  page.on("dialog", (dialog) => {
    messages.push(dialog.message());
    void (accept ? dialog.accept() : dialog.dismiss());
  });

  await openFile(page, "notes.txt", Buffer.from("not an export"));
  await expect.poll(() => messages.at(-1)).toMatch(/isn't an exported fly simulator run/);
  await openFile(page, "other.json.gz", gzipSync(JSON.stringify({ format: "something-else" })));
  await expect.poll(() => messages).toHaveLength(2);
  expect(messages[1]).toMatch(/isn't an exported fly simulator run/);
  await openFile(page, "corrupt.json.gz", Buffer.from([0x1f, 0x8b, 1, 2, 3]));
  await expect.poll(() => messages).toHaveLength(3);
  expect(messages[2]).toMatch(/isn't an exported fly simulator run/);

  const future = { ...file, recordFormatVersion: 99 };
  await openFile(page, "future.json.gz", gzipSync(JSON.stringify(future)));
  await expect.poll(() => messages).toHaveLength(4);
  expect(messages[3]).toMatch(/record format version is 99, which this version .* can't read/);

  // Another model version needs confirming, and declining leaves the run as it was.
  const older = { ...file, seed: 77, modelVersion: "0.1.0" };
  await openFile(page, "older.json.gz", gzipSync(JSON.stringify(older)));
  await expect.poll(() => messages).toHaveLength(5);
  expect(messages[4]).toMatch(/model version 0\.1\.0.*might not be the same run/);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.flySim.seed)).toBe(12);

  accept = true;
  await openFile(page, "older.json.gz", gzipSync(JSON.stringify(older)));
  await expect.poll(() => messages).toHaveLength(6);
  await replayedTo(page, 77, 50);
});
