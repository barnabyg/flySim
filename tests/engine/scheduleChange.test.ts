import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  STEPS_PER_SECOND,
  createSimulationRun,
  type Intervention,
  type LightSchedule,
} from "../../src/engine";

const HOUR = 3600;
const ALWAYS_OFF: LightSchedule = { lightsOnHour: 6, lightHours: 0 };
const ALWAYS_ON: LightSchedule = { lightsOnHour: 6, lightHours: 24 };

describe("changing the light schedule during a run", () => {
  it("changes the Room's light at once, and keeps the Room's clock running on", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 5 });
    run.advanceSeconds(2 * HOUR);
    const before = run.current();
    run.intervene({ type: "light-schedule", lightSchedule: ALWAYS_OFF });
    run.advanceSteps(1);
    const after = run.current();

    expect(before.lightLevel).toBe(1);
    expect(after.lightLevel).toBe(0);
    expect(after.senses.lightLevel).toBe(0);
    expect(after.lightSchedule).toEqual(ALWAYS_OFF);
    expect(after.timeOfDayHours - before.timeOfDayHours).toBeCloseTo(
      1 / STEPS_PER_SECOND / HOUR,
      9,
    );
  });

  it("follows a moved lights-on and lights-off by the Room's clock", () => {
    // The run starts at 06:00. From 08:00, the light is on from 10:00 to 14:00.
    const lightSchedule = { lightsOnHour: 10, lightHours: 4 };
    const run = createSimulationRun({
      room: DEFAULT_ROOM,
      seed: 5,
      interventions: [{ step: 2 * HOUR * STEPS_PER_SECOND, type: "light-schedule", lightSchedule }],
    });
    run.advanceSeconds(24 * HOUR);
    const at = (hourOfDay: number) =>
      run.record().samples.find((sample) => sample.timeSeconds === (hourOfDay - 6) * HOUR);

    expect(at(7)?.lightLevel).toBe(1);
    expect(at(9)?.lightLevel).toBe(0);
    expect(at(9)?.timeOfDayHours).toBeCloseTo(9, 9);
    expect(at(11)?.lightLevel).toBe(1);
    expect(at(15)?.lightLevel).toBe(0);
  });

  it("can keep the light always on or always off", () => {
    for (const [lightSchedule, level] of [
      [ALWAYS_ON, 1],
      [ALWAYS_OFF, 0],
    ] as const) {
      const run = createSimulationRun({
        room: DEFAULT_ROOM,
        seed: 5,
        interventions: [{ step: 1, type: "light-schedule", lightSchedule }],
      });
      run.advanceSeconds(30 * HOUR);
      const levels = new Set(
        run
          .record()
          .samples.slice(1)
          .map((sample) => sample.lightLevel),
      );
      expect(levels).toEqual(new Set([level]));
    }
  });

  it("stores each change in the run record as an intervention with its step", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 5 });
    run.advanceSteps(1000);
    const returned = run.intervene({ type: "light-schedule", lightSchedule: ALWAYS_ON });
    run.advanceSteps(1000);
    run.intervene({ type: "disturb" });
    run.advanceSteps(1);

    expect(returned).toEqual({ step: 1000, type: "light-schedule", lightSchedule: ALWAYS_ON });
    expect(run.record().interventions).toEqual([
      { step: 1000, type: "light-schedule", lightSchedule: ALWAYS_ON },
      { step: 2000, type: "disturb" },
    ]);
    // The run's setup keeps the schedule it started with.
    expect(run.record().lightSchedule).toEqual({ lightsOnHour: 6, lightHours: 12 });
  });

  it("gives an identical run record for the same seed, parameters and interventions", () => {
    const changes: Intervention[] = [
      {
        step: 100_000,
        type: "light-schedule",
        lightSchedule: { lightsOnHour: 12, lightHours: 12 },
      },
      { step: 300_000, type: "disturb" },
      { step: 500_000, type: "light-schedule", lightSchedule: ALWAYS_OFF },
    ];
    const upFront = createSimulationRun({ room: DEFAULT_ROOM, seed: 6, interventions: changes });
    upFront.advanceSteps(800_000);

    const duringRun = createSimulationRun({ room: DEFAULT_ROOM, seed: 6 });
    let done = 0;
    for (const { step, ...action } of changes) {
      duringRun.advanceSteps(step - done);
      done = step;
      duringRun.intervene(action);
    }
    duringRun.advanceSteps(800_000 - done);

    const unchanged = createSimulationRun({ room: DEFAULT_ROOM, seed: 6 });
    unchanged.advanceSteps(800_000);

    expect(duringRun.record()).toEqual(upFront.record());
    expect(unchanged.record()).not.toEqual(upFront.record());
  });

  it("rejects a schedule that can't exist", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 5 });
    expect(() =>
      run.intervene({ type: "light-schedule", lightSchedule: { lightsOnHour: 6, lightHours: 25 } }),
    ).toThrow(/lights/);
    expect(() =>
      createSimulationRun({
        room: DEFAULT_ROOM,
        seed: 5,
        interventions: [
          { step: 10, type: "light-schedule", lightSchedule: { lightsOnHour: 24, lightHours: 1 } },
        ],
      }),
    ).toThrow(/lights/);
  });
});

describe("the light's effect on the fly", () => {
  it("is a Driver of its own, which follows the sensed light at once", () => {
    const switchAt = HOUR * STEPS_PER_SECOND;
    const run = createSimulationRun({
      room: DEFAULT_ROOM,
      seed: 5,
      interventions: [{ step: switchAt, type: "light-schedule", lightSchedule: ALWAYS_OFF }],
    });
    run.advanceSeconds(3 * HOUR);
    const { samples } = run.record();
    const lightOn = (sampleStep: (step: number) => boolean) =>
      samples
        .filter((sample) => sampleStep(sample.step))
        .flatMap((sample) => sample.transitions.map((state) => state.contributions.light));

    expect(Math.max(...lightOn((step) => step < switchAt))).toBeGreaterThan(0);
    expect(new Set(lightOn((step) => step > switchAt))).toEqual(new Set([0]));
    for (const fired of run.firedTransitions) {
      if (fired.step > switchAt) expect(fired.contributions.light).toBe(0);
    }
  });

  it("makes the fly less active as soon as the light goes out", () => {
    // The same seeds and hours, with the light put out two hours into the day or left on.
    // Trips to food and water, and the restlessness of a fly in need of them, would swamp the
    // light's effect in so few runs, so a well-fed and watered fly has none to make.
    const walkingShare = (lightSchedule?: LightSchedule): number => {
      let walking = 0;
      for (const seed of [41, 42, 43, 44, 45, 46]) {
        const run = createSimulationRun({
          room: DEFAULT_ROOM,
          seed,
          food: null,
          water: null,
          parameters: { ...DEFAULT_PARAMETERS, initialEnergy: 0.95, initialHydration: 0.95 },
          interventions: lightSchedule
            ? [{ step: 2 * HOUR * STEPS_PER_SECOND, type: "light-schedule", lightSchedule }]
            : [],
        });
        run.advanceSeconds(2 * HOUR);
        const before = run.record().timeInBehaviourSeconds.walking;
        run.advanceSeconds(HOUR);
        walking += run.record().timeInBehaviourSeconds.walking - before;
      }
      return walking;
    };

    expect(walkingShare(ALWAYS_OFF)).toBeLessThan(0.8 * walkingShare());
  });
});
