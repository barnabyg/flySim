import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { exportFiles, type Death, type RunTableName } from "../engine";
import type { BatchOptions } from "./batchOptions";
import { serveOneJob } from "./processPool";
import { simulateSeed } from "./simulateSeed";

/** What the batch sends a seed's process. */
export interface SeedJob {
  readonly options: BatchOptions;
  readonly seed: number;
}

/** What a seed's process sends back once its files are written. */
export interface FinishedSeed {
  readonly seed: number;
  /** How long the run lasted in simulated seconds, which is shorter if its fly died. */
  readonly durationSeconds: number;
  readonly death: Death | null;
  /** Paths from the output directory, with / between folders on every platform. */
  readonly files: { readonly json: string } & Readonly<Record<RunTableName, string>>;
}

/** Per-seed files go in their own folder, beside the combined tables. */
export const SEEDS_FOLDER = "seeds";

function runJob({ options, seed }: SeedJob): FinishedSeed {
  let file;
  try {
    file = simulateSeed(options, seed);
  } catch (error) {
    throw new Error(
      `Seed ${seed} failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  mkdirSync(join(options.outputDirectory, SEEDS_FOLDER), { recursive: true });
  const paths: Partial<Record<RunTableName | "json", string>> = {};
  for (const { name, text, table } of [...exportFiles(file, "json"), ...exportFiles(file, "csv")]) {
    const path = `${SEEDS_FOLDER}/${name}`;
    writeFileSync(join(options.outputDirectory, path), gzipSync(text));
    paths[table ?? "json"] = path;
  }
  return {
    seed,
    durationSeconds: file.step / file.stepsPerSecond,
    death: file.death,
    files: paths as Record<RunTableName | "json", string>,
  };
}

// Each seed runs in a process of its own, which the batch starts and sends one job.
serveOneJob(runJob);
