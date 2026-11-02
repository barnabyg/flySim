import {
  STEPS_PER_SECOND,
  createSimulationRun,
  exportRun,
  setupFromOptions,
  type RunExport,
  type RunSample,
} from "../engine";
import type { BatchOptions } from "./batchOptions";

/**
 * Runs one seed of a batch for its duration, or until its fly dies, and exports it as the viewer
 * would. Only the samples the export keeps are held, so a run of many days fits in memory.
 */
export function simulateSeed(options: BatchOptions, seed: number): RunExport {
  const run = createSimulationRun({
    ...setupFromOptions({ ...options.setup, seed }),
    // The run's own record keeps only the latest sample, as the export's are gathered here.
    maxRecordedSamples: 1,
  });
  const stepsApart = options.sampleIntervalSeconds * STEPS_PER_SECOND;
  const lastStep = Math.round(options.durationSeconds * STEPS_PER_SECOND);
  const samples: RunSample[] = [run.current()];
  while (run.current().step < lastStep && !run.current().death) {
    run.advanceSteps(Math.min(stepsApart, lastStep - run.current().step));
    const sample = run.current();
    if (sample.step % stepsApart === 0) samples.push(sample);
  }
  return exportRun({ ...run.record(), samples }, options.sampleIntervalSeconds);
}
