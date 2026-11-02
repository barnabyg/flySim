import { fork } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { once } from "node:events";
import { createGzip, gunzipSync } from "node:zlib";
import { MODEL_VERSION, RECORD_FORMAT_VERSION, RUN_TABLE_NAMES, type Death } from "../engine";
import type { BatchOptions } from "./batchOptions";
import type { SeedJob, SeedOutcome } from "./seedProcess";

export type FinishedSeed = Exclude<SeedOutcome, { error: string }>;

/** What a batch ran, written beside its files. */
export interface BatchManifest {
  readonly format: "fly-sim-batch";
  readonly recordFormatVersion: number;
  readonly modelVersion: string;
  /** Leaves out how many seeds ran at once, which changes nothing in the files. */
  readonly options: Omit<BatchOptions, "jobs">;
  /** The combined tables across every seed. */
  readonly tables: Readonly<Record<(typeof RUN_TABLE_NAMES)[number], string>>;
  readonly runs: readonly {
    readonly seed: number;
    readonly durationSeconds: number;
    readonly died: boolean;
    readonly death: Death | null;
    readonly files: FinishedSeed["files"];
  }[];
}

export const MANIFEST_FILE = "manifest.json";

const SEED_PROCESS = new URL("./seedProcess.ts", import.meta.url);
const RESOLVE_TYPESCRIPT = new URL("./resolveTypeScript.ts", import.meta.url).href;

/** Runs one seed in a process of its own. */
async function runSeed(options: BatchOptions, seed: number): Promise<FinishedSeed> {
  const child = fork(SEED_PROCESS, [], { execArgv: ["--import", RESOLVE_TYPESCRIPT] });
  const outcome = new Promise<SeedOutcome>((resolve, reject) => {
    child.once("message", (message) => {
      resolve(message as SeedOutcome);
    });
    child.once("exit", (code) => {
      reject(
        new Error(`Seed ${seed}'s process stopped (exit code ${String(code)}) before finishing`),
      );
    });
    child.once("error", reject);
  });
  const job: SeedJob = { options, seed };
  child.send(job);
  const result = await outcome;
  if ("error" in result) throw new Error(`Seed ${seed} failed: ${result.error}`);
  return result;
}

/** Writes one table across every seed, with a single header row, in the order the seeds ran. */
async function combineTable(directory: string, seedFiles: readonly string[], to: string) {
  const gzip = createGzip();
  const written = once(gzip.pipe(createWriteStream(join(directory, to))), "finish");
  seedFiles.forEach((file, index) => {
    const text = gunzipSync(readFileSync(join(directory, file))).toString("utf8");
    gzip.write(index === 0 ? text : text.slice(text.indexOf("\n") + 1));
  });
  gzip.end();
  await written;
}

/**
 * Runs every seed of a batch, several at once up to the number of jobs, and writes each seed's
 * exports, the combined tables and a manifest. It reports each seed as it finishes.
 */
export async function runBatch(
  options: BatchOptions,
  onFinished: (seed: FinishedSeed, finished: number) => void,
): Promise<BatchManifest> {
  mkdirSync(options.outputDirectory, { recursive: true });
  const waiting = [...options.seeds];
  const finished = new Map<number, FinishedSeed>();
  async function worker(): Promise<void> {
    for (let seed = waiting.shift(); seed !== undefined; seed = waiting.shift()) {
      const outcome = await runSeed(options, seed);
      finished.set(seed, outcome);
      onFinished(outcome, finished.size);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(options.jobs, options.seeds.length) }, () => worker()),
  );

  const runs = options.seeds.map((seed) => {
    const outcome = finished.get(seed);
    if (!outcome) throw new Error(`Seed ${seed} never finished`);
    return outcome;
  });
  const tables = Object.fromEntries(
    RUN_TABLE_NAMES.map((name) => [name, `${name}.csv.gz`]),
  ) as BatchManifest["tables"];
  for (const name of RUN_TABLE_NAMES) {
    await combineTable(
      options.outputDirectory,
      runs.map((run) => run.files[name]),
      tables[name],
    );
  }
  const manifest: BatchManifest = {
    format: "fly-sim-batch",
    recordFormatVersion: RECORD_FORMAT_VERSION,
    modelVersion: MODEL_VERSION,
    options: {
      seeds: options.seeds,
      durationSeconds: options.durationSeconds,
      outputDirectory: options.outputDirectory,
      sampleIntervalSeconds: options.sampleIntervalSeconds,
      setup: options.setup,
    },
    tables,
    runs: runs.map(({ seed, durationSeconds, death, files }) => ({
      seed,
      durationSeconds,
      died: death !== null,
      death,
      files,
    })),
  };
  writeFileSync(
    join(options.outputDirectory, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}
