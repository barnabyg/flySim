import type { SimulationRun } from "../engine";
import { scoreActivity, type ScoredActivity } from "./scoring";

/**
 * What a beam-crossing activity monitor records of one fly: how many times it crossed an infrared
 * beam across its tube in each bin. That is all it records, so it is all its scoring can see.
 */
export interface BeamObservation {
  readonly kind: "beam-crossing";
  readonly binSeconds: number;
  /** Simulated seconds from the start of the run to the start of the first bin. */
  readonly startSeconds: number;
  /** Beam crossings in each bin. */
  readonly counts: readonly number[];
  /** Whether the fly died before the record ended, as a lab would see. Its bins then stop. */
  readonly died: boolean;
}

/** How a beam-crossing monitor is set up, as a study set it up. */
export interface BeamMonitorSettings {
  /** Where each beam crosses the tube, in metres along its length from the food end. */
  readonly beamPositionsMetres: readonly number[];
  readonly binSeconds: number;
}

/**
 * Watches a run from its current step, recording each crossing of a beam in a bin, for as many
 * whole bins as there are from the current step up to the given simulated second. A fly in the
 * beam doesn't cross it, so grooming or standing in place never counts.
 */
export function recordBeamCrossings(
  run: SimulationRun,
  settings: BeamMonitorSettings,
  untilSeconds: number,
): BeamObservation {
  const { stepsPerSecond } = run.record();
  const stepsPerBin = Math.round(settings.binSeconds * stepsPerSecond);
  if (!(stepsPerBin >= 1 && stepsPerBin === settings.binSeconds * stepsPerSecond)) {
    throw new Error(`A bin of ${settings.binSeconds} s isn't a whole number of steps`);
  }
  const startStep = run.current().step;
  const bins = Math.floor((untilSeconds * stepsPerSecond - startStep) / stepsPerBin);
  const counts: number[] = [];
  let x = run.pose().position.x;
  let died = false;
  for (let bin = 0; bin < bins && !died; bin++) {
    let count = 0;
    for (let step = 0; step < stepsPerBin; step++) {
      run.advanceSteps(1);
      const next = run.pose().position.x;
      for (const beam of settings.beamPositionsMetres) {
        if (x < beam !== next < beam) count += 1;
      }
      x = next;
    }
    counts.push(count);
    died = run.current().death !== null;
  }
  return {
    kind: "beam-crossing",
    binSeconds: settings.binSeconds,
    startSeconds: startStep / stepsPerSecond,
    counts,
    died,
  };
}

/** Which bins showed movement: any beam crossing at all. */
export function activeBins(observation: BeamObservation): boolean[] {
  return observation.counts.map((count) => count > 0);
}

/** Scores a beam-crossing record, and nothing else. */
export function scoreBeamObservation(
  observation: BeamObservation,
  sleepThresholdMinutes: number,
): ScoredActivity {
  return scoreActivity(
    activeBins(observation),
    observation.binSeconds,
    observation.startSeconds,
    sleepThresholdMinutes,
  );
}
