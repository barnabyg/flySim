import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  DRIVERS,
  STEPS_PER_SECOND,
  createSimulationRun,
  type FloorPlace,
  type ModelParameters,
  type RunSample,
} from "../../src/engine";
import { recordOf } from "./helpers";

const HOUR = 3600;
const DAY = 24 * HOUR;

function startOf(seed: number): FloorPlace {
  const { position } = createSimulationRun({ room: DEFAULT_ROOM, seed }).current();
  return { x: position.x, y: position.y };
}

function withParameters(changes: Partial<ModelParameters>): ModelParameters {
  return { ...DEFAULT_PARAMETERS, ...changes };
}

describe("removing and restoring a source", () => {
  it("are Interventions stored in the run record", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 1 });
    run.advanceSeconds(5);
    const removed = run.intervene({ type: "remove-source", source: "food" });
    run.advanceSeconds(5);
    const restored = run.intervene({ type: "restore-source", source: "food" });
    run.advanceSeconds(1);
    const { interventions, samples, food } = run.record();

    expect(interventions).toEqual([
      { type: "remove-source", source: "food", step: 5 * STEPS_PER_SECOND },
      { type: "restore-source", source: "food", step: 10 * STEPS_PER_SECOND },
    ]);
    expect([removed.step, restored.step]).toEqual([250, 500]);
    expect(samples.find((sample) => sample.timeSeconds === 7)?.food).toBeNull();
    expect(samples.at(-1)?.food).toEqual(food);
  });

  it("leaves nothing to touch or sense while the source is gone", () => {
    const start = startOf(2);
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 2, food: start, water: start });
    expect(run.current().senses.touchingFood).toBe(true);
    run.intervene({ type: "remove-source", source: "food" });
    run.intervene({ type: "remove-source", source: "water" });
    run.advanceSteps(1);
    const { senses, food, water } = run.current();

    expect(food).toBeNull();
    expect(water).toBeNull();
    expect(senses.touchingFood).toBe(false);
    expect(senses.touchingWater).toBe(false);
    expect(senses.odour).toBe(0);
    expect(senses.humidity).toBe(DEFAULT_PARAMETERS.globalHumidity);
  });

  it("puts a source back where it was last moved to", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 3 });
    run.intervene({ type: "remove-source", source: "water" });
    run.intervene({ type: "move-source", source: "water", place: { x: 0.4, y: 0.4 } });
    run.advanceSteps(1);
    expect(run.current().water).toBeNull();
    run.intervene({ type: "restore-source", source: "water" });
    run.advanceSteps(1);
    expect(run.current().water).toEqual({ x: 0.4, y: 0.4 });
  });
});

describe("going without", () => {
  /** Walking per hour while the reserve is high, and once it is nearly gone. */
  function activity(reserve: "energy" | "hydration", samples: readonly RunSample[]) {
    const share = (picked: readonly RunSample[]) =>
      picked.filter((sample) => sample.behaviour === "walking").length / picked.length;
    return {
      high: share(samples.filter((sample) => sample[reserve] > 0.2)),
      low: share(samples.filter((sample) => sample[reserve] < 0.03 && sample.death === null)),
    };
  }

  it("runs the energy reserve down without food, and the fly grows less active", () => {
    let high = 0;
    let low = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { samples } = recordOf(seed, 2 * DAY, {
        food: null,
        parameters: withParameters({ initialEnergy: 0.25 }),
      });
      for (let i = 1; i < samples.length; i++) {
        if (samples[i]?.death) break;
        expect(samples[i]?.energy).toBeLessThan(samples[i - 1]?.energy ?? 0);
      }
      const shares = activity("energy", samples);
      high += shares.high;
      low += shares.low;
    }
    expect(low).toBeLessThan(0.3 * high);
  });

  it("runs the hydration reserve down without water, and the fly grows less active", () => {
    let high = 0;
    let low = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { samples } = recordOf(seed, 2 * DAY, {
        water: null,
        parameters: withParameters({ initialHydration: 0.25 }),
      });
      for (let i = 1; i < samples.length; i++) {
        if (samples[i]?.death) break;
        expect(samples[i]?.hydration).toBeLessThan(samples[i - 1]?.hydration ?? 0);
      }
      const shares = activity("hydration", samples);
      high += shares.high;
      low += shares.low;
    }
    expect(low).toBeLessThan(0.3 * high);
  });

  it("weakens the fly through its Drivers, which still add up to each hazard", () => {
    const { samples } = recordOf(1, 2 * DAY, {
      food: null,
      parameters: withParameters({ initialEnergy: 0.1 }),
    });
    const weak = samples.filter((sample) => sample.energy < 0.03 && sample.death === null);
    expect(weak.length).toBeGreaterThan(100);
    for (const state of weak.flatMap((sample) => sample.transitions)) {
      const total = DRIVERS.reduce((sum, driver) => sum + state.contributions[driver], 0);
      expect(total).toBeCloseTo(state.hazard, 12);
    }
  });
});

describe("death", () => {
  it("comes when the energy reserve runs out, and the run record says so", () => {
    const run = createSimulationRun({
      room: DEFAULT_ROOM,
      seed: 4,
      food: null,
      parameters: withParameters({ initialEnergy: 0.05 }),
    });
    run.advanceSeconds(2 * DAY);
    const { death, samples } = run.record();

    expect(death?.cause).toBe("starvation");
    expect(death?.timeSeconds).toBeLessThan(2 * DAY);
    expect(samples.at(-1)?.death).toEqual(death);
    expect(samples.at(-1)?.energy).toBe(0);
  });

  it("comes when the hydration reserve runs out, and the run record says so", () => {
    const { death } = recordOf(5, 2 * DAY, {
      water: null,
      parameters: withParameters({ initialHydration: 0.05 }),
    });
    expect(death?.cause).toBe("desiccation");
  });

  it("ends the run: nothing advances and no transitions fire", () => {
    const run = createSimulationRun({
      room: DEFAULT_ROOM,
      seed: 6,
      water: null,
      parameters: withParameters({ initialHydration: 0.02 }),
    });
    run.advanceSeconds(DAY);
    const at = run.current();
    if (!at.death) throw new Error("expected the fly to have died");
    const fired = run.firedTransitions.length;
    run.advanceSeconds(HOUR);

    expect(run.current()).toEqual(at);
    expect(run.firedTransitions).toHaveLength(fired);
    expect(at.transitions).toEqual([]);
    expect(at.speedMetresPerSecond).toBe(0);
    expect(at.surface).toBe("floor");
    expect(() => run.intervene({ type: "disturb" })).toThrow();
  });
});

describe("a default run", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`lasts several simulated days without death, seed ${seed}`, () => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed, maxRecordedSamples: 1 });
      run.advanceSeconds(4 * DAY);
      expect(run.record().death).toBeNull();
    });
  }
});

describe("losing contact mid-bout", () => {
  for (const [source, behaviour, reserve] of [
    ["food", "feeding", "energy"],
    ["water", "drinking", "hydration"],
  ] as const) {
    it(`ends ${behaviour} at once when the ${source} is taken away, with nothing more taken in`, () => {
      const start = startOf(4);
      const run = createSimulationRun({
        room: DEFAULT_ROOM,
        seed: 4,
        [source]: start,
        parameters: withParameters({ initialEnergy: 0.3, initialHydration: 0.3 }),
      });
      while (run.current().behaviour !== behaviour) run.advanceSteps(1);
      run.advanceSeconds(5);
      run.intervene({ type: "remove-source", source });
      const before = run.current()[reserve];
      run.advanceSeconds(1);
      const after = run.current();

      expect(after.behaviour).not.toBe(behaviour);
      expect(after[reserve]).toBeLessThanOrEqual(before);
      const ended = run.firedTransitions.at(-1);
      expect(ended?.from).toBe(behaviour);
      expect(ended?.contributions.contact).toBeGreaterThan(0);
    });
  }
});
