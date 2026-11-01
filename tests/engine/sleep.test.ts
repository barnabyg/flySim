import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  DRIVERS,
  createSimulationRun,
  type ModelParameters,
  type RunRecord,
  type Surface,
} from "../../src/engine";

const HOUR = 3600;

function recordOf(
  seed: number,
  simulatedSeconds: number,
  parameters: ModelParameters = DEFAULT_PARAMETERS,
): RunRecord {
  const run = createSimulationRun({ room: DEFAULT_ROOM, seed, parameters });
  run.advanceSeconds(simulatedSeconds);
  return run.record();
}

describe("sleep", () => {
  const { samples, firedTransitions } = recordOf(1, 12 * HOUR);
  const fellAsleep = firedTransitions.filter((fired) => fired.to === "sleeping");
  const woke = firedTransitions.filter((fired) => fired.from === "sleeping");

  it("starts and ends with no input, through Transition Hazards and Trigger Levels", () => {
    expect(fellAsleep.length).toBeGreaterThan(2);
    expect(woke.length).toBeGreaterThan(2);
    for (const fired of [...fellAsleep, ...woke]) {
      expect(fired.hazard).toBeGreaterThan(0);
      expect(fired.triggerLevel).toBeGreaterThan(0);
    }
  });

  it("is entered only from Immobility, and left only for Immobility", () => {
    for (const fired of fellAsleep) expect(fired.from).toBe("immobility");
    for (const fired of woke) expect(fired.to).toBe("immobility");
  });

  it("can happen on any surface", () => {
    const sleptOn = new Set<Surface>();
    for (let seed = 0; seed < 8; seed++) {
      for (const sample of recordOf(seed, 6 * HOUR).samples) {
        if (sample.behaviour === "sleeping" && sample.surface) sleptOn.add(sample.surface);
      }
    }
    expect(sleptOn.size).toBe(6);
  });

  it("exposes the true Vigilance State separately from behaviour", () => {
    expect(samples.some((sample) => sample.vigilanceState === "asleep")).toBe(true);
    // Awake Immobility and sleep look the same to a camera, and only this tells them apart.
    expect(samples.some((sample) => sample.behaviour === "immobility")).toBe(true);
    for (const sample of samples) {
      expect(sample.vigilanceState).toBe(sample.behaviour === "sleeping" ? "asleep" : "awake");
    }
    for (const fired of firedTransitions) {
      expect(fired.vigilanceState).toBe(fired.to === "sleeping" ? "asleep" : "awake");
      expect(fired.sleepPressure).toBeGreaterThan(0);
    }
  });

  it("has sleep pressure that rises while awake and falls while asleep", () => {
    let rises = 0;
    let falls = 0;
    samples.forEach((sample, index) => {
      const next = samples[index + 1];
      // A pair spanning a change of state moves partly each way, so it shows neither.
      if (!next || next.vigilanceState !== sample.vigilanceState) return;
      if (sample.vigilanceState === "awake") {
        expect(next.sleepPressure).toBeGreaterThan(sample.sleepPressure);
        rises += 1;
      } else {
        expect(next.sleepPressure).toBeLessThan(sample.sleepPressure);
        falls += 1;
      }
    });
    expect(rises).toBeGreaterThan(1000);
    expect(falls).toBeGreaterThan(1000);
  });

  it("gives the same sleep hazards at the same state however long the bout has lasted", () => {
    // Each record's bouts start at a firing, so the time since the last firing is time in bout.
    const timeInBout = (timeSeconds: number): number =>
      timeSeconds -
      (firedTransitions.findLast((fired) => fired.timeSeconds <= timeSeconds)?.timeSeconds ?? 0);

    const hazardsByPressure = (
      transition: string,
      behaviour: string,
      withoutState: (arousal: number) => number,
    ) =>
      samples
        .filter((sample) => sample.behaviour === behaviour)
        .map((sample) => ({
          sleepPressure: sample.sleepPressure,
          timeInBout: timeInBout(sample.timeSeconds),
          hazard:
            (sample.transitions.find((state) => state.transition === transition)?.hazard ?? NaN) /
            withoutState(sample.arousal),
        }))
        .sort((a, b) => a.sleepPressure - b.sleepPressure);

    const settled = (arousal: number): number => (1 - arousal) * (1 - arousal);
    let comparisons = 0;
    for (const items of [
      hazardsByPressure("immobility-to-sleeping", "immobility", settled),
      hazardsByPressure("sleeping-to-immobility", "sleeping", () => 1),
    ]) {
      items.forEach((item, index) => {
        const next = items[index + 1];
        if (!next || Math.abs(next.timeInBout - item.timeInBout) < 60) return;
        const closeness = Math.abs(next.sleepPressure - item.sleepPressure);
        if (closeness > 0.001) return;
        comparisons += 1;
        expect(Math.abs(next.hazard - item.hazard)).toBeLessThan(1e-4);
      });
    }
    expect(comparisons).toBeGreaterThan(50);
  });

  it("splits the sleep hazards into per-Driver contributions, with sleep pressure among them", () => {
    const states = samples.flatMap((sample) => sample.transitions);
    const sleepStates = states.filter((state) => state.transition.includes("sleeping"));

    expect(sleepStates.length).toBeGreaterThan(1000);
    for (const state of sleepStates) {
      const total = DRIVERS.reduce((sum, driver) => sum + state.contributions[driver], 0);
      expect(total).toBeCloseTo(state.hazard, 12);
      expect(state.contributions.sleepPressure).toBeGreaterThan(0);
      expect(state.fireProbabilityNextMinute).toBeCloseTo(1 - Math.exp(-state.hazard * 60), 12);
    }
  });

  it("shows no movement while the fly sleeps", () => {
    const sleeping = samples.filter((sample) => sample.behaviour === "sleeping");

    expect(sleeping.length).toBeGreaterThan(100);
    samples.forEach((sample, index) => {
      const previous = samples[index - 1];
      if (sample.behaviour !== "sleeping") return;
      expect(sample.speedMetresPerSecond).toBe(0);
      if (previous?.behaviour === "sleeping") {
        expect(sample.position).toEqual(previous.position);
        expect(sample.forward).toEqual(previous.forward);
      }
    });
  });
});
