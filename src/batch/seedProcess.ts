import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  RUN_TABLE_NAMES,
  exportFileName,
  exportTables,
  type Death,
  type RunTableName,
} from "../engine";
import type { BatchOptions } from "./batchOptions";
import { simulateSeed } from "./simulateSeed";

/** What the batch sends a seed's process. */
export interface SeedJob {
  readonly options: BatchOptions;
  readonly seed: number;
}

/** What a seed's process sends back once its files are written. */
export type SeedOutcome =
  | {
      readonly seed: number;
      /** How long the run lasted in simulated seconds, which is shorter if its fly died. */
      readonly durationSeconds: number;
      readonly death: Death | null;
      /** Paths from the output directory, with / between folders on every platform. */
      readonly files: { readonly json: string } & Readonly<Record<RunTableName, string>>;
    }
  | { readonly seed: number; readonly error: string };

/** Per-seed files go in their own folder, beside the combined tables. */
export const SEEDS_FOLDER = "seeds";

function runJob({ options, seed }: SeedJob): SeedOutcome {
  const file = simulateSeed(options, seed);
  const tables = exportTables(file);
  const json = `${SEEDS_FOLDER}/${exportFileName(file, "", "json.gz")}`;
  const tableFiles = Object.fromEntries(
    RUN_TABLE_NAMES.map((name) => [
      name,
      `${SEEDS_FOLDER}/${exportFileName(file, name, "csv.gz")}`,
    ]),
  ) as Record<RunTableName, string>;
  mkdirSync(join(options.outputDirectory, SEEDS_FOLDER), { recursive: true });
  writeFileSync(join(options.outputDirectory, json), gzipSync(JSON.stringify(file)));
  for (const name of RUN_TABLE_NAMES) {
    writeFileSync(join(options.outputDirectory, tableFiles[name]), gzipSync(tables[name]));
  }
  return {
    seed,
    durationSeconds: file.step / file.stepsPerSecond,
    death: file.death,
    files: { json, ...tableFiles },
  };
}

// Each seed runs in a process of its own, which the batch starts and sends one job.
process.once("message", (job: SeedJob) => {
  let outcome: SeedOutcome;
  try {
    outcome = runJob(job);
  } catch (error) {
    outcome = { seed: job.seed, error: error instanceof Error ? error.message : String(error) };
  }
  process.send?.(outcome, () => {
    process.disconnect?.();
  });
});
