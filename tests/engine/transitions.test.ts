import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  DRIVERS,
  createSimulationRun,
  type Behaviour,
  type ModelParameters,
  type RunRecord,
} from "../../src/engine";

function recordOf(seed: number, simulatedSeconds: number): RunRecord {
  const run = createSimulationRun({ room: DEFAULT_ROOM, seed });
  run.advanceSeconds(simulatedSeconds);
  return run.record();
}

describe("Transition Hazards", () => {
  it("splits a known hazard into its per-Driver contributions", () => {
    // At step 0, arousal is 0.5, so arousal contributes 0.25 * 0.5^2 = 0.0625 per second.
    const [state] = createSimulationRun({ room: DEFAULT_ROOM, seed: 1 }).current().transitions;

    expect(state?.transition).toBe("immobility-to-walking");
    expect(state?.contributions.spontaneous).toBeCloseTo(0.002, 12);
    expect(state?.contributions.arousal).toBeCloseTo(0.0625, 12);
    expect(state?.hazard).toBeCloseTo(0.0645, 12);
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
      },
    });
    expect(halfLifeRun.current().transitions[0]?.fireProbabilityNextMinute).toBeCloseTo(0.5, 12);

    // The default initial hazard of 0.0645 per second gives 1 - exp(-3.87).
    const defaultRun = createSimulationRun({ room: DEFAULT_ROOM, seed: 1 });
    expect(defaultRun.current().transitions[0]?.fireProbabilityNextMinute).toBeCloseTo(0.979143, 5);
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
