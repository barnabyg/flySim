import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import type { BatchManifest } from "../../src/batch/batch";
import {
  MODEL_VERSION,
  RECORD_FORMAT_VERSION,
  createSimulationRun,
  exportRun,
  readRunExport,
  replaySetup,
  type RunExport,
} from "../../src/engine";
import { settingsFromUrl, setupForSettings } from "../../src/viewer/runSettings";

const run = promisify(execFile);
const RESOLVE_TYPESCRIPT = new URL("../../src/batch/resolveTypeScript.ts", import.meta.url).href;
const CLI = fileURLToPath(new URL("../../src/batch/cli.ts", import.meta.url));

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

function outputDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "fly-sim-batch-"));
  directories.push(directory);
  return directory;
}

/** Runs the batch command as npm run batch does. */
async function batch(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [
      "--import",
      RESOLVE_TYPESCRIPT,
      CLI,
      ...args,
    ]);
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const failed = error as { stdout: string; stderr: string; code: number };
    return { stdout: failed.stdout, stderr: failed.stderr, code: failed.code };
  }
}

function readGzipped(path: string): string {
  return gunzipSync(readFileSync(path)).toString("utf8");
}

function manifestIn(directory: string): BatchManifest {
  return JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as BatchManifest;
}

/** Every file a batch wrote, by its path from the output directory. */
function filesIn(directory: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(path.slice(directory.length + 1).replace(/\\/g, "/"), readFileSync(path));
  }
  return files;
}

describe("a batch of seeded runs", () => {
  const setupArgs = [
    "--width",
    "0.6",
    "--depth",
    "0.8",
    "--food",
    "0.1,0.2",
    "--energy",
    "0.5",
    "--light-hours",
    "10",
  ];
  const out = outputDirectory();
  const first = batch(
    "--seeds",
    "4-6",
    "--duration",
    "20m",
    "--sample-interval",
    "30",
    "--jobs",
    "2",
    "--out",
    out,
    ...setupArgs,
  );

  it("writes each seed's exports, combined tables and a manifest, and reports progress", async () => {
    const { stdout, code } = await first;
    expect(code).toBe(0);
    expect(stdout).toMatch(/Seed 5: 0\.33 h, alive \(\d of 3/);
    expect(stdout).toMatch(/The batch took [\d.]+ s/);

    const manifest = manifestIn(out);
    expect(manifest).toMatchObject({
      format: "fly-sim-batch",
      recordFormatVersion: RECORD_FORMAT_VERSION,
      modelVersion: MODEL_VERSION,
      options: {
        seeds: [4, 5, 6],
        durationSeconds: 1200,
        sampleIntervalSeconds: 30,
        setup: {
          room: { widthMetres: 0.6, depthMetres: 0.8, heightMetres: 0.6 },
          food: { x: 0.1, y: 0.2 },
          energy: 0.5,
          lightHours: 10,
        },
      },
    });
    expect(
      manifest.runs.map(({ seed, durationSeconds, died }) => [seed, durationSeconds, died]),
    ).toEqual([
      [4, 1200, false],
      [5, 1200, false],
      [6, 1200, false],
    ]);

    // The combined tables have one header, and every seed's rows in order.
    for (const [name, table] of Object.entries(manifest.tables)) {
      const [header, ...rows] = readGzipped(join(out, table)).trimEnd().split("\n");
      const seedRows = manifest.runs.map((each) =>
        readGzipped(join(out, each.files[name as keyof typeof each.files]))
          .trimEnd()
          .split("\n"),
      );
      for (const seedTable of seedRows) expect(seedTable[0]).toBe(header);
      expect(rows).toEqual(seedRows.flatMap((seedTable) => seedTable.slice(1)));
      if (name !== "interventions") {
        expect(new Set(rows.map((row) => row.split(",")[0]))).toEqual(new Set(["4", "5", "6"]));
      }
      for (const row of rows) expect(row.split(",")[1]).toBe(MODEL_VERSION);
    }
    expect(readGzipped(join(out, "samples.csv.gz")).trimEnd().split("\n")).toHaveLength(1 + 3 * 41);
  });

  it("exports each seed in the viewer's format, reproducing the same run as the viewer", async () => {
    await first;
    const manifest = manifestIn(out);
    const seed = manifest.runs[1];
    if (!seed) throw new Error("no second seed");
    const fromBatch: RunExport = readRunExport(readGzipped(join(out, seed.files.json))).run;

    // The same seed and setup as the viewer's URL gives them.
    const settings = settingsFromUrl(
      "?seed=5&width=0.6&depth=0.8&height=0.6&food=0.1,0.2&energy=0.5&lightHours=10",
      [60],
      60,
    );
    const viewerRun = createSimulationRun(setupForSettings(settings));
    viewerRun.advanceSeconds(1200);
    // Through JSON, as the file was, which writes -0 as 0.
    const fromViewer: unknown = JSON.parse(JSON.stringify(exportRun(viewerRun.record(), 30)));
    expect(fromBatch).toEqual(fromViewer);
  });

  it("writes identical files when the same command runs again", async () => {
    await first;
    const before = filesIn(out);
    expect(before.size).toBe(4 + 3 * 4);
    const { code } = await batch(
      "--seeds",
      "4-6",
      "--duration",
      "20m",
      "--sample-interval",
      "30",
      "--jobs",
      "3",
      "--out",
      out,
      ...setupArgs,
    );
    expect(code).toBe(0);
    expect(filesIn(out)).toEqual(before);
  });

  it("ends a run whose fly dies, and the manifest says so", async () => {
    const dry = outputDirectory();
    const { code } = await batch(
      "--seeds",
      "1-2",
      "--duration",
      "2h",
      "--hydration",
      "0.01",
      "--water",
      "0.98,0.98",
      "--out",
      dry,
    );
    expect(code).toBe(0);
    for (const each of manifestIn(dry).runs) {
      expect(each.died).toBe(true);
      expect(each.death?.cause).toBe("desiccation");
      expect(each.durationSeconds).toBeLessThan(7200);
      expect(each.durationSeconds).toBeCloseTo(each.death?.timeSeconds ?? 0, 9);
    }
  });

  it("runs at the step size it is given, which its exports keep and replay", async () => {
    const fine = outputDirectory();
    const { code } = await batch(
      "--seeds",
      "3",
      "--duration",
      "10m",
      "--steps-per-second",
      "100",
      "--out",
      fine,
    );
    expect(code).toBe(0);
    const [seed] = manifestIn(fine).runs;
    if (!seed) throw new Error("no seed");
    expect(manifestIn(fine).options.setup.stepsPerSecond).toBe(100);
    const file = readRunExport(readGzipped(join(fine, seed.files.json))).run;
    expect(file.stepsPerSecond).toBe(100);
    expect(file.step).toBe(600 * 100);

    const replay = createSimulationRun(replaySetup(file));
    replay.advanceSteps(file.step);
    expect(JSON.parse(JSON.stringify(exportRun(replay.record())))).toEqual(file);
  });

  it("fails with a clear message before any run starts when an option is invalid", async () => {
    for (const [args, message] of [
      [["--width", "0.01"], /Room's width must be from 0\.1 to 5 m/],
      [["--food", "3,0.5"], /isn't on the Room's floor/],
      [["--seeds", "9-3"], /runs backwards/],
      [["--duration", "10"], /--duration must be a simulated time with a unit/],
      [["--hydration", "0"], /hydration reserve must start from 0\.01 to 1/],
      [["--steps-per-second", "10"], /whole number of steps a second from 25 to 1000/],
      [["--colour", "red"], /Unknown option '--colour'/],
    ] as const) {
      const empty = join(outputDirectory(), "never");
      const { code, stderr } = await batch(...args, "--out", empty);
      expect(code).toBe(1);
      expect(stderr).toMatch(message);
      expect(existsSync(empty)).toBe(false);
    }
  });
});
