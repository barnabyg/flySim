import { serveOneJob } from "../batch/processPool";
import { observeFly, type BeamCrossingAssay } from "./assays";

/** What the validation suite sends one fly's process. */
export interface ObserveJob {
  readonly assay: BeamCrossingAssay;
  readonly seed: number;
  readonly stepsPerSecond: number;
}

// Each fly runs in a process of its own, as a Batch's seeds do, and sends back only its observation.
serveOneJob(({ assay, seed, stepsPerSecond }: ObserveJob) =>
  observeFly(assay, seed, stepsPerSecond),
);
