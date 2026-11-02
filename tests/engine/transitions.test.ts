import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  DRIVERS,
  createSimulationRun,
  type Behaviour,
  type ModelParameters,
} from "../../src/engine";
import { recordOf } from "./helpers";

/** Only the original two transitions can fire, so nothing competes with them. */
const IMMOBILITY_AND_WALKING_ONLY = {
  ...DEFAULT_PARAMETERS,
  takeOffFromImmobilitySpontaneousRate: 0,
  takeOffFromImmobilityArousalRate: 0,
  takeOffFromWalkingSpontaneousRate: 0,
  takeOffFromWalkingArousalRate: 0,
  startGroomingSpontaneousRate: 0,
  startGroomingArousalRate: 0,
  fallAsleepSleepPressureRate: 0,
  fallAsleepCircadianRate: 0,
};

describe("Transition Hazards", () => {
  it("splits a known hazard into its per-Driver contributions", () => {
    // At step 0, arousal is 0.5, so arousal contributes 0.25 * 0.5^2 = 0.0625 per second,
    // and the run starts at lights-on, so light adds 0.002.
    const [state] = createSimulationRun({ room: DEFAULT_ROOM, seed: 1 }).current().transitions;

    expect(state?.transition).toBe("immobility-to-walking");
    expect(state?.contributions.spontaneous).toBeCloseTo(0.0003, 12);
    expect(state?.contributions.arousal).toBeCloseTo(0.0625, 12);
    expect(state?.contributions.light).toBeCloseTo(0.002, 12);
    expect(state?.hazard).toBeCloseTo(0.0648, 12);
  });

  it("has per-Driver contributions that combine to the hazard throughout a run", () => {
    const { samples, firedTransitions } = recordOf(2, 3600);
    const states = [...samples.flatMap((sample) => sample.transitions), ...firedTransitions];

    expect(states.length).toBeGreaterThan(3000);
    for (const state of states) {
      const total = DRIVERS.reduce((sum, driver) => sum + state.contributions[driver], 0);
      expect(total).toBeCloseTo(state.hazard, 12);
    }
  });

  it("changes Driver contributions as the run goes on", () => {
    const { samples } = recordOf(2, 3600);
    const arousalContributions = new Set(
      samples.flatMap((sample) => sample.transitions.map((state) => state.contributions.arousal)),
    );

    expect(arousalContributions.size).toBeGreaterThan(1000);
  });

  it("shares firings between competing transitions in proportion to their hazards", () => {
    // Constant hazards of 0.06 and 0.02 per second, so 3 in 4 firings should start walking.
    const parameters = {
      ...IMMOBILITY_AND_WALKING_ONLY,
      startWalkingSpontaneousRate: 0.06,
      startWalkingArousalRate: 0,
      startGroomingSpontaneousRate: 0.02,
    };
    const fromImmobility = Array.from({ length: 20 }, (_, seed) => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed, parameters });
      run.advanceSeconds(3600);
      return run.firedTransitions.filter((fired) => fired.from === "immobility");
    }).flat();
    const walkingShare =
      fromImmobility.filter((fired) => fired.to === "walking").length / fromImmobility.length;

    expect(fromImmobility.length).toBeGreaterThan(500);
    expect(walkingShare).toBeGreaterThan(0.7);
    expect(walkingShare).toBeLessThan(0.8);
  });

  it("gives the same hazard at the same arousal however long the bout has lasted", () => {
    const { samples, firedTransitions } = recordOf(23, 7200);
    const timeInBout = (timeSeconds: number): number => {
      const started = firedTransitions.findLast((fired) => fired.timeSeconds <= timeSeconds);
      return timeSeconds - (started?.timeSeconds ?? 0);
    };
    const immobile = samples
      .filter((sample) => sample.behaviour === "immobility")
      .map((sample) => ({
        arousal: sample.arousal,
        hazard: sample.transitions[0]?.hazard ?? NaN,
        timeInBout: timeInBout(sample.timeSeconds),
      }))
      .sort((a, b) => a.arousal - b.arousal);

    // Neighbours in arousal should agree on hazard. Where their time in the bout
    // differs a lot, any direct dependence on it would show up as a gap.
    let comparisons = 0;
    for (let i = 1; i < immobile.length; i++) {
      const a = immobile[i - 1];
      const b = immobile[i];
      if (!a || !b) throw new Error("missing sample");
      if (Math.abs(a.timeInBout - b.timeInBout) > 30) {
        comparisons += 1;
        expect(Math.abs(a.hazard - b.hazard)).toBeLessThan(0.001);
      }
    }
    expect(comparisons).toBeGreaterThan(50);
  });
});

describe("Trigger Levels", () => {
  it("are drawn from an exponential distribution with mean 1", () => {
    // Competing transitions would bias the level of whichever fires first, so only one competes.
    const levels = Array.from({ length: 20 }, (_, seed) =>
      recordOf(seed, 7200, { parameters: IMMOBILITY_AND_WALKING_ONLY }),
    )
      .flatMap((record) => record.firedTransitions)
      .map((fired) => fired.triggerLevel);
    const mean = levels.reduce((sum, level) => sum + level, 0) / levels.length;
    const shareBelowOne = levels.filter((level) => level < 1).length / levels.length;

    expect(levels.length).toBeGreaterThan(500);
    expect(mean).toBeGreaterThan(0.9);
    expect(mean).toBeLessThan(1.1);
    // For an exponential with mean 1, P(level < 1) = 1 - 1/e = 0.632.
    expect(shareBelowOne).toBeGreaterThan(0.58);
    expect(shareBelowOne).toBeLessThan(0.68);
  });

  it("fire a transition when its accumulated hazard reaches the level", () => {
    const { samples, firedTransitions } = recordOf(31, 7200);

    // Integrate the once-a-second hazard over each bout that's long enough for
    // the integral to be accurate, and compare it with the Trigger Level.
    let checked = 0;
    let boutStart = 0;
    for (const fired of firedTransitions) {
      const inBout = samples.filter(
        (sample) => sample.timeSeconds > boutStart && sample.timeSeconds <= fired.timeSeconds,
      );
      if (inBout.length >= 20) {
        const accumulated = inBout.reduce(
          (sum, sample) =>
            sum +
            (sample.transitions.find((state) => state.transition === fired.transition)?.hazard ??
              0),
          0,
        );
        expect(Math.abs(accumulated - fired.triggerLevel)).toBeLessThan(
          0.1 * fired.triggerLevel + 0.05,
        );
        checked += 1;
      }
      boutStart = fired.timeSeconds;
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("default tuning", () => {
  it("shows every awake behaviour within about 10 simulated minutes in nearly every run", () => {
    const awake: readonly Behaviour[] = ["immobility", "grooming", "walking", "flying"];
    const seeds = Array.from({ length: 100 }, (_, seed) => seed);
    const showingAll = seeds.filter((seed) => {
      const { timeInBehaviourSeconds } = recordOf(seed, 600);
      return awake.every((behaviour) => timeInBehaviourSeconds[behaviour] > 0);
    });

    expect(showingAll.length).toBeGreaterThanOrEqual(95);
  });
});

describe("red strip probability", () => {
  it("is the chance of firing within the next simulated minute at the current hazard", () => {
    // A constant hazard of ln(2)/60 per second has a half-life of exactly one minute.
    const halfLifeRun = createSimulationRun({
      room: DEFAULT_ROOM,
      seed: 1,
      parameters: {
        ...DEFAULT_PARAMETERS,
        startWalkingSpontaneousRate: Math.LN2 / 60,
        startWalkingArousalRate: 0,
        startWalkingLightRate: 0,
      },
    });
    expect(halfLifeRun.current().transitions[0]?.fireProbabilityNextMinute).toBeCloseTo(0.5, 12);

    // The default initial hazard of 0.0648 per second gives 1 - exp(-3.888).
    const defaultRun = createSimulationRun({ room: DEFAULT_ROOM, seed: 1 });
    expect(defaultRun.current().transitions[0]?.fireProbabilityNextMinute).toBeCloseTo(0.979514, 5);
  });

  // Different Trigger Level streams change when transitions fire and nothing else. So
  // until either run has a further firing, the runs must match exactly, strip included.
  function samplesComparedBeforeFiring(parameters: ModelParameters, firingsToSkip: number): number {
    let compared = 0;
    for (let seed = 0; seed < 20; seed++) {
      const [first, second] = [100, 200].map((triggerStream) => {
        const run = createSimulationRun({ room: DEFAULT_ROOM, seed, parameters, triggerStream });
        run.advanceSeconds(1800);
        return run.record();
      });
      const firstFiring = first?.firedTransitions[firingsToSkip];
      const secondFiring = second?.firedTransitions[firingsToSkip];
      if (!first || !second || !firstFiring || !secondFiring) throw new Error("expected firings");

      expect(firstFiring.triggerLevel).not.toBe(secondFiring.triggerLevel);
      const end = Math.min(firstFiring.timeSeconds, secondFiring.timeSeconds);
      const before = first.samples.filter((sample) => sample.timeSeconds < end);
      expect(second.samples.slice(0, before.length)).toEqual(before);
      compared += before.length;
    }
    return compared;
  }

  it("doesn't use the Trigger Level while the fly is immobile", () => {
    expect(samplesComparedBeforeFiring(DEFAULT_PARAMETERS, 0)).toBeGreaterThan(100);
  });

  it("doesn't use the Trigger Level while the fly is walking", () => {
    // A huge hazard starts walking on the first step in both runs, whatever their Trigger Levels.
    const walksAtOnce = { ...DEFAULT_PARAMETERS, startWalkingSpontaneousRate: 1e6 };
    expect(samplesComparedBeforeFiring(walksAtOnce, 1)).toBeGreaterThan(100);
  });

  it("lets transitions fire at low intensity", () => {
    const fired = Array.from({ length: 10 }, (_, seed) => recordOf(seed, 7200)).flatMap(
      (record) => record.firedTransitions,
    );
    const lowIntensity = fired.filter((item) => item.fireProbabilityNextMinute < 0.25);

    expect(lowIntensity.length).toBeGreaterThan(0);
  });
});
