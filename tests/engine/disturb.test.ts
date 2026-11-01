import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  DRIVERS,
  createSimulationRun,
  type Intervention,
  type RunSample,
  type SimulationRun,
} from "../../src/engine";

const DISTURB_AT: Intervention = { step: 30_000, type: "disturb" };

function recordWithUpFront(interventions: readonly Intervention[], steps: number) {
  const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 8, interventions });
  run.advanceSteps(steps);
  return run.record();
}

function recordWithDuringRun(steps: readonly number[], totalSteps: number) {
  const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 8 });
  let done = 0;
  for (const step of steps) {
    run.advanceSteps(step - done);
    done = step;
    run.intervene("disturb");
  }
  run.advanceSteps(totalSteps - done);
  return run.record();
}

describe("timed interventions", () => {
  it("stores every intervention with its step", () => {
    const { interventions } = recordWithDuringRun([1000, 25_000], 30_000);

    expect(interventions).toEqual([
      { step: 1000, type: "disturb" },
      { step: 25_000, type: "disturb" },
    ]);
  });

  it("gives the same run record whether supplied up front or during the run", () => {
    const steps = [10_000, 10_000, 40_000];
    const upFront = steps.map((step) => ({ step, type: "disturb" as const }));

    expect(recordWithUpFront(upFront, 90_000)).toEqual(recordWithDuringRun(steps, 90_000));
    expect(recordWithUpFront(upFront, 90_000)).not.toEqual(recordWithUpFront([], 90_000));
  });

  it("gives the same record part-way through, before a later intervention is due", () => {
    const upFront = [
      { step: 10_000, type: "disturb" as const },
      { step: 40_000, type: "disturb" as const },
    ];

    expect(recordWithUpFront(upFront, 20_000)).toEqual(recordWithDuringRun([10_000], 20_000));
  });

  it("orders interventions by step, wherever they came from", () => {
    const run = createSimulationRun({
      room: DEFAULT_ROOM,
      seed: 8,
      interventions: [
        { step: 900, type: "disturb" },
        { step: 300, type: "disturb" },
      ],
    });
    run.advanceSteps(500);
    run.intervene("disturb");
    run.advanceSteps(1000);

    expect(run.record().interventions.map(({ step }) => step)).toEqual([300, 500, 900]);
  });

  it("applies each at a step boundary, however the run is advanced", () => {
    const inOneGo = recordWithUpFront([DISTURB_AT], 60_000);
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 8, interventions: [DISTURB_AT] });
    for (const steps of [7, 29_990, 2, 1, 1, 29_999]) run.advanceSteps(steps);

    expect(run.record()).toEqual(inOneGo);
  });

  it("takes effect on the step after it was asked for, not before", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 8 });
    run.advanceSteps(1000);
    const { step } = run.intervene("disturb");

    expect(step).toBe(1000);
    // A paused run shows no effect until time resumes.
    expect(run.current().startle).toBe(0);
    run.advanceSteps(1);
    expect(run.current().startle).toBeGreaterThan(0.99);
  });

  it("rejects an intervention at an impossible step", () => {
    for (const step of [-1, 0.5]) {
      expect(() =>
        createSimulationRun({
          room: DEFAULT_ROOM,
          seed: 1,
          interventions: [{ step, type: "disturb" }],
        }),
      ).toThrow(/intervention/);
    }
  });
});

describe("the startle", () => {
  /** What the run looks like once a second after being disturbed, whatever it's then doing. */
  function secondsAfterDisturb(seconds: number): RunSample[] {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 8, interventions: [DISTURB_AT] });
    run.advanceSteps(DISTURB_AT.step + seconds * 50);
    return run.record().samples.filter((sample) => sample.step > DISTURB_AT.step);
  }

  it("has contributions that add up to each hazard, and a strip from the hazard alone", () => {
    const samples = secondsAfterDisturb(10);
    const states = samples.flatMap((sample) => sample.transitions);
    const startled = states.filter((state) => state.contributions.startle > 0);

    expect(startled.length).toBeGreaterThan(3);
    for (const state of states) {
      const total = DRIVERS.reduce((sum, driver) => sum + state.contributions[driver], 0);
      expect(total).toBeCloseTo(state.hazard, 12);
      expect(state.fireProbabilityNextMinute).toBeCloseTo(1 - Math.exp(-state.hazard * 60), 12);
    }
  });

  it("never reads the Trigger Level", () => {
    const stateAfterDisturb = (triggerStream: number): RunSample => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 8, triggerStream });
      run.advanceSteps(1);
      run.intervene("disturb");
      run.advanceSteps(1);
      return run.current();
    };

    expect(stateAfterDisturb(100).transitions).toEqual(stateAfterDisturb(200).transitions);
  });

  it("fades over time and ends completely", () => {
    const samples = secondsAfterDisturb(120);
    const startleAt = (seconds: number): number => samples[seconds - 1]?.startle ?? NaN;

    expect(startleAt(1)).toBeGreaterThan(0.8);
    expect(startleAt(16)).toBeLessThan(0.2);
    expect(startleAt(30)).toBeLessThan(0.03);
    expect(startleAt(120)).toBe(0);
    for (const state of samples.at(-1)?.transitions ?? []) {
      expect(state.contributions.startle).toBe(0);
    }
  });

  /** Runs on until the fly's state is as asked for, then disturbs it. False if it never was. */
  function disturbOnceIn(run: SimulationRun, isWanted: (sample: RunSample) => boolean): boolean {
    for (let seconds = 0; seconds < 3600; seconds++) {
      if (isWanted(run.current())) {
        run.intervene("disturb");
        return true;
      }
      run.advanceSeconds(1);
    }
    return false;
  }

  /** The share of runs in which the fly changes what it's doing within 15 s of a Disturb. */
  function responseChance(isWanted: (sample: RunSample) => boolean, sleepy: boolean): number {
    // A high sleep pressure and easy onset reach each depth of sleep early in a run.
    const parameters = sleepy
      ? { ...DEFAULT_PARAMETERS, initialSleepPressure: 0.7, fallAsleepSleepPressureRate: 1 }
      : DEFAULT_PARAMETERS;
    const outcomes = Array.from({ length: 60 }, (_, seed) => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed: seed + 100, parameters });
      if (!disturbOnceIn(run, isWanted)) return undefined;
      const before = run.firedTransitions.length;
      run.advanceSeconds(15);
      return run.firedTransitions.length > before;
    }).filter((outcome) => outcome !== undefined);

    expect(outcomes.length).toBeGreaterThan(40);
    return outcomes.filter(Boolean).length / outcomes.length;
  }

  it("makes a response less likely from awake to light sleep to deep sleep", () => {
    const awake = responseChance(
      (sample) => sample.vigilanceState === "awake" && sample.behaviour !== "flying",
      false,
    );
    const light = responseChance((sample) => (sample.sleepDepth ?? 1) < 0.2, true);
    const deep = responseChance((sample) => (sample.sleepDepth ?? 0) > 0.6, true);

    expect(awake).toBeGreaterThan(0.95);
    expect(light).toBeLessThan(awake);
    expect(light).toBeGreaterThan(0.6);
    expect(deep).toBeLessThan(light - 0.2);
  });
});
