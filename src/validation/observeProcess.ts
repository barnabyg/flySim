import type { ModelParameters } from "../engine";
import { serveOneJob } from "../batch/processPool";
import { observeFly, type StudySetup } from "./assays";
import type { InstrumentSettings } from "./instruments";

/** What the validation suite sends one fly's process: a study and the instruments watching it. */
export interface ObserveJob {
  readonly study: StudySetup;
  readonly instruments: readonly InstrumentSettings[];
  readonly seed: number;
  readonly stepsPerSecond: number;
  readonly parameters: ModelParameters;
}

// Each fly runs in a process of its own, as a Batch's seeds do, and sends back only what the
// instruments recorded.
serveOneJob(({ study, instruments, seed, stepsPerSecond, parameters }: ObserveJob) =>
  observeFly(study, instruments, seed, { stepsPerSecond, parameters }),
);
