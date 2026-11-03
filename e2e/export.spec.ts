import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, test, type Download, type Page } from "@playwright/test";
import type { RunExport } from "../src/engine";
import { currentTime, openApp, runRecord } from "./helpers";

/** Exports the run in a format, with samples the given seconds apart, and waits for each file. */
async function exportAs(
  page: Page,
  format: "json" | "csv",
  sampleInterval: number,
  files = 1,
): Promise<Download[]> {
  await page.locator("#export-settings summary").click();
  await page.locator("#sample-interval").fill(String(sampleInterval));
  const downloads: Download[] = [];
  const allArrived = new Promise<void>((resolve) => {
    page.on("download", (download) => {
      downloads.push(download);
      if (downloads.length === files) resolve();
    });
  });
  await page.locator(`#export-${format}`).click();
  await allArrived;
  return downloads;
}

async function gunzipped(download: Download): Promise<string> {
  return gunzipSync(await readFile(await download.path())).toString("utf8");
}

test("the export control downloads the run as gzipped JSON, tagged and with its Intervention", async ({
  page,
}) => {
  await openApp(page, 42);
  await expect(page.locator("#export-settings summary svg")).toBeVisible();
  await expect(page.locator("#export-settings summary")).toHaveAccessibleName("Export the run");
  await expect.poll(() => currentTime(page)).toBeGreaterThan(20);
  await page.locator("#disturb").click();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(90);
  await page.locator("#pause").click();

  const [download] = await exportAs(page, "json", 5);
  if (!download) throw new Error("no download");
  const record = await runRecord(page);
  const file = JSON.parse(await gunzipped(download)) as RunExport;

  expect(download.suggestedFilename()).toBe(
    `fly-sim-seed-42-at-${Math.floor(record.step / record.stepsPerSecond)}s.json.gz`,
  );
  expect(file).toMatchObject({
    format: "fly-sim-run",
    recordFormatVersion: 3,
    chamber: null,
    modelVersion: record.modelVersion,
    seed: 42,
    triggerStream: record.triggerStream,
    room: record.room,
    parameters: record.parameters,
    food: record.food,
    water: record.water,
    lightSchedule: record.lightSchedule,
    step: record.step,
    sampleIntervalSeconds: 5,
    samplesStartSeconds: 0,
  });
  expect(file.interventions).toEqual(record.interventions);
  expect(file.interventions).toEqual([{ type: "disturb", step: expect.any(Number) }]);
  expect(file.firedTransitions).toEqual(record.firedTransitions);
  expect(file.samples.length).toBe(Math.floor(record.step / record.stepsPerSecond / 5) + 1);
  for (const sample of file.samples) expect(sample.step % (5 * record.stepsPerSecond)).toBe(0);
});

test("the export control downloads the samples, transitions and Interventions as CSV tables", async ({
  page,
}) => {
  await openApp(page, 42);
  await expect.poll(() => currentTime(page)).toBeGreaterThan(20);
  await page.locator("#water-presence").click();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(90);
  await page.locator("#pause").click();

  const downloads = await exportAs(page, "csv", 10, 3);
  const record = await runRecord(page);
  const at = Math.floor(record.step / record.stepsPerSecond);
  const names = downloads.map((each) => each.suggestedFilename()).sort();
  expect(names).toEqual(
    ["interventions", "samples", "transitions"].map(
      (table) => `fly-sim-seed-42-at-${at}s-${table}.csv.gz`,
    ),
  );
  const tables = Object.fromEntries(
    await Promise.all(
      downloads.map(async (each) => {
        const table = /-(\w+)\.csv\.gz$/.exec(each.suggestedFilename())?.[1] ?? "";
        const [header = "", ...rows] = (await gunzipped(each)).trimEnd().split("\n");
        const columns = header.split(",");
        const objects = rows.map((row): Record<string, string> =>
          Object.fromEntries(row.split(",").map((value, index) => [columns[index] ?? "", value])),
        );
        return [table, { columns, rows: objects }] as const;
      }),
    ),
  );

  const { samples, transitions, interventions } = tables;
  if (!samples || !transitions || !interventions) throw new Error("missing a table");
  expect(samples.columns.slice(0, 4)).toEqual(["seed", "model_version", "step", "time_s"]);
  expect(samples.columns).toEqual(
    expect.arrayContaining(["behaviour", "vigilance_state", "sleep_depth", "hunger", "thirst"]),
  );
  expect(samples.rows).toHaveLength(Math.floor(at / 10) + 1);
  const first = record.samples[0];
  expect(samples.rows[0]).toMatchObject({
    seed: "42",
    model_version: record.modelVersion,
    step: "0",
    behaviour: first?.behaviour,
    x: String(first?.position.x),
  });

  expect(transitions.columns).toEqual(
    expect.arrayContaining(["step", "from", "to", "trigger_level", "hazard", "startle"]),
  );
  expect(transitions.rows).toHaveLength(record.firedTransitions.length);
  const fired = record.firedTransitions[0];
  expect(transitions.rows[0]).toMatchObject({
    step: String(fired?.step),
    from: fired?.from,
    to: fired?.to,
    trigger_level: String(fired?.triggerLevel),
  });

  expect(interventions.columns).toEqual([
    "seed",
    "model_version",
    "step",
    "time_s",
    "type",
    "source",
    "x",
    "y",
    "lights_on_h",
    "light_hours",
  ]);
  expect(interventions.rows).toEqual([
    expect.objectContaining({
      seed: "42",
      step: String(record.interventions[0]?.step),
      type: "remove-source",
      source: "water",
    }),
  ]);
});
