import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  DRIVERS,
  createSimulationRun,
  type ModelParameters,
  type RunRecord,
  type RunSample,
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

/** The stretches of a record's samples for which the fly is asleep. */
function sleepBouts(samples: readonly RunSample[]): RunSample[][] {
  const bouts: RunSample[][] = [];
  samples.forEach((sample, index) => {
    if (sample.behaviour !== "sleeping") return;
    if (samples[index - 1]?.behaviour !== "sleeping") bouts.push([]);
    bouts.at(-1)?.push(sample);
  });
  return bouts;
}

describe("Sleep Depth", () => {
  const long = recordOf(2, 24 * HOUR);
  const bouts = sleepBouts(long.samples);
  const longBouts = bouts.filter((bout) => bout.length > 900);

  it("has a value only while the fly sleeps", () => {
    expect(bouts.length).toBeGreaterThan(2);
    for (const sample of long.samples) {
      if (sample.behaviour === "sleeping") {
        expect(sample.sleepDepth).toBeGreaterThanOrEqual(0);
        expect(sample.sleepDepth).toBeLessThanOrEqual(1);
      } else {
        expect(sample.sleepDepth).toBeNull();
      }
    }
    for (const fired of long.firedTransitions) {
      if (fired.from === "sleeping") expect(fired.sleepDepth).toEqual(expect.any(Number));
      else expect(fired.sleepDepth).toBeNull();
    }
  });

  it("changes during a bout, and differs between bouts and seeds", () => {
    const depthAt = (bout: readonly RunSample[], index: number): number =>
      bout[index]?.sleepDepth ?? NaN;

    expect(longBouts.length).toBeGreaterThan(1);
    for (const bout of longBouts) {
      const depths = bout.map((sample) => sample.sleepDepth ?? NaN);
      expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.05);
    }
    // The same time into each bout gives a different depth.
    const atFifteenMinutes = longBouts.map((bout) => depthAt(bout, 899));
    expect(new Set(atFifteenMinutes).size).toBe(atFifteenMinutes.length);

    const otherSeed = sleepBouts(recordOf(3, 12 * HOUR).samples).find((bout) => bout.length > 900);
    expect(otherSeed).toBeDefined();
    expect(depthAt(otherSeed ?? [], 899)).not.toBe(atFifteenMinutes[0]);
  });

  it("lowers the wake hazard as it rises", () => {
    // With only the spontaneous Driver left, depth is the only thing that can move the hazard.
    const { samples } = recordOf(5, 24 * HOUR, {
      ...DEFAULT_PARAMETERS,
      wakeLowSleepPressureRate: 0,
    });
    const asleep = samples
      .filter((sample) => sample.behaviour === "sleeping")
      .map((sample) => ({
        depth: sample.sleepDepth ?? NaN,
        hazard: sample.transitions[0]?.hazard ?? NaN,
      }))
      .sort((a, b) => a.depth - b.depth);

    expect(asleep.length).toBeGreaterThan(1000);
    expect((asleep.at(-1)?.depth ?? 0) - (asleep[0]?.depth ?? 0)).toBeGreaterThan(0.3);
    asleep.forEach((item, index) => {
      const next = asleep[index + 1];
      if (next && next.depth > item.depth) expect(next.hazard).toBeLessThan(item.hazard);
    });
  });

  it("shrinks the wake bar through its Drivers, whose contributions still add up", () => {
    const states = long.samples.flatMap((sample) =>
      sample.behaviour === "sleeping"
        ? sample.transitions.map((state) => ({ state, depth: sample.sleepDepth ?? 0 }))
        : [],
    );

    for (const { state, depth } of states) {
      const total = DRIVERS.reduce((sum, driver) => sum + state.contributions[driver], 0);
      expect(total).toBeCloseTo(state.hazard, 12);
      expect(state.contributions.spontaneous).toBeCloseTo(
        DEFAULT_PARAMETERS.wakeSpontaneousRate *
          (1 - DEFAULT_PARAMETERS.wakeSleepDepthReduction * depth),
        12,
      );
    }
  });

  it("evolves from sleep pressure and its own noise, not from time in the bout", () => {
    const depthAfterTenMinutes = (initialSleepPressure: number, sleepDepthNoise: number) => {
      const parameters = {
        ...DEFAULT_PARAMETERS,
        initialSleepPressure,
        sleepDepthNoise,
        // Falls asleep on the first steps, and doesn't wake during the measurement.
        fallAsleepSleepPressureRate: 1e6,
        wakeSpontaneousRate: 0,
        wakeLowSleepPressureRate: 0,
      };
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 1, parameters });
      run.advanceSeconds(600);
      return run.current().sleepDepth ?? NaN;
    };

    // The same time in the bout gives a different depth when the state differs.
    expect(depthAfterTenMinutes(0.6, 0)).toBeGreaterThan(depthAfterTenMinutes(0.2, 0) + 0.1);
    expect(depthAfterTenMinutes(0.2, 0.008)).not.toBe(depthAfterTenMinutes(0.2, 0));
  });
});

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
    // Without Sleep Depth, the wake hazard depends on sleep pressure alone.
    const { samples, firedTransitions } = recordOf(1, 12 * HOUR, {
      ...DEFAULT_PARAMETERS,
      wakeSleepDepthReduction: 0,
    });
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
