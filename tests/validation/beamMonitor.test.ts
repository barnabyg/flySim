import { describe, expect, it } from "vitest";
import { createSimulationRun, type Behaviour } from "../../src/engine";
import { ACTIVITY_MONITOR, assaySetup, recordBeamCrossings } from "../../src/validation";

const HOUR = 3600;

describe("a beam-crossing activity monitor", () => {
  it("records crossings only while the fly walks, never while it stands, grooms or sleeps", () => {
    for (const seed of [1, 2]) {
      const run = createSimulationRun({
        ...assaySetup(ACTIVITY_MONITOR, seed),
        maxRecordedSamples: Infinity,
      });
      const observation = recordBeamCrossings(
        run,
        { beamPositionsMetres: [0.0325], binSeconds: 60 },
        6 * HOUR,
      );
      const record = run.record();
      expect(observation.counts).toHaveLength(6 * 60);
      expect(observation.counts.some((count) => count > 0)).toBe(true);

      // The test, unlike the scorer, may look at the true behaviour, minute by minute.
      const walkedIn = observation.counts.map(() => false);
      let behaviour: Behaviour = "immobility";
      let fired = 0;
      for (let step = 0; step < record.step; step += 1) {
        while (record.firedTransitions[fired]?.step === step) {
          behaviour = record.firedTransitions[fired]?.to ?? behaviour;
          fired += 1;
        }
        if (behaviour === "walking") walkedIn[Math.floor(step / (60 * 50))] = true;
      }
      observation.counts.forEach((count, minute) => {
        if (count > 0) expect(walkedIn[minute], `minute ${minute}`).toBe(true);
      });
      // Grooming happened, and none of it was counted on its own.
      expect(record.timeInBehaviourSeconds.grooming).toBeGreaterThan(0);
    }
  });

  it("counts each crossing of each beam", () => {
    const run = createSimulationRun(assaySetup(ACTIVITY_MONITOR, 3));
    const oneBeam = recordBeamCrossings(
      run,
      { beamPositionsMetres: [0.0325], binSeconds: 60 },
      HOUR,
    );
    const again = createSimulationRun(assaySetup(ACTIVITY_MONITOR, 3));
    const threeBeams = recordBeamCrossings(
      again,
      { beamPositionsMetres: [0.02, 0.0325, 0.045], binSeconds: 60 },
      HOUR,
    );
    const total = (counts: readonly number[]) => counts.reduce((sum, each) => sum + each, 0);
    expect(total(threeBeams.counts)).toBeGreaterThan(total(oneBeam.counts));
  });
});
