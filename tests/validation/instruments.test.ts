import { describe, expect, it } from "vitest";
import { createSimulationRun, type Behaviour, type RunRecord } from "../../src/engine";
import {
  ACTIVITY_MONITOR,
  assaySetup,
  observeRun,
  type BeamObservation,
  type InstrumentSettings,
  type Observation,
  type VideoObservation,
} from "../../src/validation";

const HOUR = 3600;
const { study } = ACTIVITY_MONITOR;

/** Watches a fly in the standard tube with each instrument, keeping its full Run Record. */
function watch(
  seed: number,
  instruments: readonly InstrumentSettings[],
  hours: number,
): { observations: Observation[]; record: RunRecord } {
  const run = createSimulationRun({ ...assaySetup(study, seed), maxRecordedSamples: Infinity });
  const observations = observeRun(run, instruments, hours * HOUR);
  return { observations, record: run.record() };
}

/** Which true behaviours the fly was in during each window: for the test, never the scorer. */
function behavioursByWindow(record: RunRecord, windowSeconds: number): Set<Behaviour>[] {
  const stepsPerWindow = windowSeconds * record.stepsPerSecond;
  const windows = Array.from({ length: record.step / stepsPerWindow }, () => new Set<Behaviour>());
  let behaviour: Behaviour = "immobility";
  let fired = 0;
  for (let step = 0; step < record.step; step += 1) {
    // A transition's step is the end of the step it fired in, which it governs.
    while (record.firedTransitions[fired]?.step === step + 1) {
      behaviour = record.firedTransitions[fired]?.to ?? behaviour;
      fired += 1;
    }
    windows[Math.floor(step / stepsPerWindow)]?.add(behaviour);
  }
  return windows;
}

function movedWindows(observation: VideoObservation): boolean[] {
  return observation.runs.flatMap(([moved, windows]) => Array<boolean>(windows).fill(moved));
}

describe("a beam-crossing activity monitor", () => {
  it("records crossings only while the fly walks, never while it stands, grooms or sleeps", () => {
    for (const seed of [1, 2]) {
      const beam: InstrumentSettings = {
        kind: "beam-crossing",
        beamPositionsMetres: [0.0325],
        binSeconds: 60,
      };
      const { observations, record } = watch(seed, [beam], 6);
      const [observation] = observations as [BeamObservation];
      expect(observation.counts).toHaveLength(6 * 60);
      expect(observation.counts.some((count) => count > 0)).toBe(true);
      const behaviours = behavioursByWindow(record, 60);
      observation.counts.forEach((count, minute) => {
        if (count > 0) expect(behaviours[minute]?.has("walking"), `minute ${minute}`).toBe(true);
      });
      expect(record.timeInBehaviourSeconds.grooming).toBeGreaterThan(0);
    }
  });

  it("counts each crossing of each beam", () => {
    const total = (observation: Observation) =>
      (observation as BeamObservation).counts.reduce((sum, each) => sum + each, 0);
    const { observations } = watch(
      3,
      [
        { kind: "beam-crossing", beamPositionsMetres: [0.0325], binSeconds: 60 },
        { kind: "beam-crossing", beamPositionsMetres: [0.02, 0.0325, 0.045], binSeconds: 60 },
      ],
      1,
    );
    const [one, three] = observations as [Observation, Observation];
    expect(total(three)).toBeGreaterThan(total(one));
  });
});

describe("a video-tracking camera", () => {
  const camera = (groomingCountsAsMovement: boolean): InstrumentSettings => ({
    kind: "video-tracking",
    frameSeconds: 1,
    windowSeconds: 5,
    movementThresholdMetres: 0.0002,
    groomingCountsAsMovement,
  });

  it("sees grooming in place as movement only when its study counts it", () => {
    const { observations, record } = watch(4, [camera(true), camera(false)], 6);
    const [withGrooming, withoutGrooming] = (observations as VideoObservation[]).map(movedWindows);
    const behaviours = behavioursByWindow(record, 5);
    expect(withGrooming).toHaveLength(6 * 720);

    let groomingOnly = 0;
    behaviours.forEach((seen, window) => {
      const still = !seen.has("walking") && !seen.has("grooming");
      // Neither camera sees a fly that is immobile or asleep all window.
      if (still && seen.size > 0 && !behaviours[window - 1]?.has("walking")) {
        expect(withGrooming?.[window], `window ${window}`).toBe(false);
        expect(withoutGrooming?.[window], `window ${window}`).toBe(false);
      }
      // Grooming in place shows only to the camera that counts it.
      if (seen.size === 1 && seen.has("grooming") && behaviours[window - 1]?.size === 1) {
        groomingOnly += 1;
        expect(withGrooming?.[window], `window ${window}`).toBe(true);
        expect(withoutGrooming?.[window], `window ${window}`).toBe(false);
      }
    });
    expect(groomingOnly).toBeGreaterThan(0);
    // Whatever moves the fly shows to both.
    withoutGrooming?.forEach((moved, window) => {
      if (moved) expect(withGrooming?.[window]).toBe(true);
    });
  });
});
