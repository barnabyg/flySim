import { resolve } from "node:path";
import { BatchOptionsError, USAGE, parseBatchOptions } from "./batchOptions";
import { MANIFEST_FILE, runBatch } from "./batch";

function simulatedTime(seconds: number): string {
  const hours = seconds / 3600;
  return hours >= 24 ? `${(hours / 24).toFixed(2)} d` : `${hours.toFixed(2)} h`;
}

async function main(): Promise<void> {
  let options;
  try {
    options = parseBatchOptions(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof BatchOptionsError)) throw error;
    console.error(`${error.message}\n\nRun npm run batch -- --help to see the options.`);
    process.exitCode = 1;
    return;
  }
  if (!options) {
    console.log(USAGE);
    return;
  }

  const started = performance.now();
  const { seeds, jobs } = options;
  console.log(
    `Running ${seeds.length} seed${seeds.length === 1 ? "" : "s"} for ${simulatedTime(options.durationSeconds)} each, ${Math.min(jobs, seeds.length)} at a time.`,
  );
  await runBatch(options, ({ seed, durationSeconds, death }, finished) => {
    const fate = death ? `died of ${death.cause}` : "alive";
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    console.log(
      `Seed ${seed}: ${simulatedTime(durationSeconds)}, ${fate} (${finished} of ${seeds.length}, ${elapsed} s)`,
    );
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `The batch took ${seconds} s. Its files and ${MANIFEST_FILE} are in ${resolve(options.outputDirectory)}`,
  );
}

await main();
