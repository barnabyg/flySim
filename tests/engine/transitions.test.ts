import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  DRIVERS,
  createSimulationRun,
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
    const arousalShares = new Set(
      samples.flatMap((sample) => sample.transitions.map((state) => state.contributions.arousal)),
    );

    expect(arousalShares.size).toBeGreaterThan(1000);
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

  it("doesn't use the Trigger Level", () => {
    const runWith = (triggerStream: number): RunRecord => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 8, triggerStream });
      run.advanceSeconds(3600);
      return run.record();
    };
    const first = runWith(100);
    const second = runWith(200);
    const firstFiring = first.firedTransitions[0];
    const secondFiring = second.firedTransitions[0];
    if (!firstFiring || !secondFiring) throw new Error("expected both runs to fire");

    // The Trigger Levels differ, but until either run fires, the strip must match exactly.
    expect(firstFiring.triggerLevel).not.toBe(secondFiring.triggerLevel);
    const untilFirstFiring = Math.min(firstFiring.timeSeconds, secondFiring.timeSeconds);
    const compared = first.samples.filter((sample) => sample.timeSeconds < untilFirstFiring);
    expect(compared.length).toBeGreaterThan(0);
    expect(second.samples.slice(0, compared.length)).toEqual(compared);
  });

  it("lets transitions fire at low intensity", () => {
    const fired = Array.from({ length: 10 }, (_, seed) => recordOf(seed, 7200)).flatMap(
      (record) => record.firedTransitions,
    );
    const lowIntensity = fired.filter((item) => item.fireProbabilityNextMinute < 0.25);

    expect(lowIntensity.length).toBeGreaterThan(0);
  });
});
