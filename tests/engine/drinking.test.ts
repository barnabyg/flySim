import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  DRIVERS,
  SOURCE_RADIUS_METRES,
  createSimulationRun,
  type FloorPlace,
  type SimulationSetup,
} from "../../src/engine";
import { recordOf } from "./helpers";

const MINUTE = 60;
const HOUR = 3600;

/** A setup with the water right under the fly's feet at the start. */
function waterUnderFly(seed: number, setup: Partial<SimulationSetup> = {}): SimulationSetup {
  const { position } = createSimulationRun({ room: DEFAULT_ROOM, seed }).current();
  return { room: DEFAULT_ROOM, seed, water: { x: position.x, y: position.y }, ...setup };
}

describe("water in the Room", () => {
  it("takes the water's place from the setup and keeps it in the run record", () => {
    const water: FloorPlace = { x: 0.8, y: 0.2 };
    const record = recordOf(1, 1, { water });

    expect(record.water).toEqual(water);
    expect(record.samples[0]?.water).toEqual(water);
  });

  it("puts the water on the floor apart from the food by default", () => {
    const { food, water } = recordOf(1, 1);
    if (!food || !water) throw new Error("expected food and water");

    expect(water.x).toBeGreaterThan(0.1);
    expect(water.x).toBeLessThan(DEFAULT_ROOM.widthMetres - 0.1);
    expect(water.y).toBeGreaterThan(0.1);
    expect(water.y).toBeLessThan(DEFAULT_ROOM.depthMetres - 0.1);
    expect(Math.hypot(water.x - food.x, water.y - food.y)).toBeGreaterThan(0.25);
  });

  it("refuses a place off the floor", () => {
    expect(() =>
      createSimulationRun({ room: DEFAULT_ROOM, seed: 1, water: { x: 0.5, y: -0.1 } }),
    ).toThrow();
  });
});

describe("the hydration reserve and Thirst", () => {
  it("exposes the reserve and Thirst in every sample, starting part-hydrated", () => {
    const { samples } = recordOf(1, 10);

    expect(samples[0]?.hydration).toBeGreaterThan(0.3);
    expect(samples[0]?.hydration).toBeLessThan(0.9);
    for (const sample of samples) {
      expect(sample.thirst).toBeGreaterThan(0);
      expect(sample.thirst).toBeLessThan(1);
    }
  });

  it("runs the reserve down without water, which raises Thirst", () => {
    const parameters = { ...DEFAULT_PARAMETERS, startDrinkingThirstRate: 0 };
    const { samples } = recordOf(3, 2 * HOUR, { parameters });
    const [first] = samples;
    const last = samples.at(-1);
    if (!first || !last) throw new Error("no samples");

    expect(last.hydration).toBeLessThan(first.hydration);
    expect(last.thirst).toBeGreaterThan(first.thirst);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]?.hydration).toBeLessThan(samples[i - 1]?.hydration ?? 0);
    }
  });
});

describe("Drinking", () => {
  it("starts on the water, refills the reserve while it lasts, and lowers Thirst", () => {
    const { samples, firedTransitions } = recordOf(4, 10 * MINUTE, waterUnderFly(4));
    const drinking = samples.filter((sample) => sample.behaviour === "drinking");

    expect(firedTransitions.some((fired) => fired.to === "drinking")).toBe(true);
    expect(drinking.length).toBeGreaterThan(10);
    for (let i = 1; i < samples.length; i++) {
      const [before, after] = [samples[i - 1], samples[i]];
      if (before?.behaviour !== "drinking" || after?.behaviour !== "drinking") continue;
      // A full reserve can't rise any further, though the bout may not have ended yet.
      if (before.hydration === 1) continue;
      expect(after.hydration).toBeGreaterThan(before.hydration);
      expect(after.thirst).toBeLessThan(before.thirst);
    }
  });

  it("happens only while the fly touches the water", () => {
    let drinkingNearWater = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const sample of recordOf(seed, HOUR, waterUnderFly(seed)).samples) {
        if (sample.behaviour !== "drinking") continue;
        drinkingNearWater += 1;
        expect(sample.senses.touchingWater).toBe(true);
        expect(sample.surface).toBe("floor");
        const place = sample.water;
        if (!place) throw new Error("no water");
        expect(Math.hypot(sample.position.x - place.x, sample.position.y - place.y)).toBeLessThan(
          SOURCE_RADIUS_METRES,
        );
      }
      // Wandering, it may or may not find the water, but it can only start on it.
      for (const sample of recordOf(seed, 3 * HOUR).samples) {
        for (const state of sample.transitions) {
          if (state.transition.endsWith("-to-drinking") && !sample.senses.touchingWater) {
            expect(state.hazard).toBe(0);
          }
        }
      }
    }
    expect(drinkingNearWater).toBeGreaterThan(0);
  });

  it("keeps the fly still on the water", () => {
    const { samples } = recordOf(4, 10 * MINUTE, waterUnderFly(4));
    const drinking = samples.filter((sample) => sample.behaviour === "drinking");
    expect(drinking.length).toBeGreaterThan(0);
    for (const sample of drinking) expect(sample.speedMetresPerSecond).toBe(0);
    expect(new Set(drinking.map((sample) => sample.position.x)).size).toBe(1);
  });

  it("ends through a hazard that rises as Thirst falls, and exposes Thirst when it fires", () => {
    const { samples, firedTransitions } = recordOf(4, 10 * MINUTE, waterUnderFly(4));
    const stops = samples
      .filter((sample) => sample.behaviour === "drinking")
      .map((sample) => ({
        thirst: sample.thirst,
        state: sample.transitions.find((state) => state.transition === "drinking-to-immobility"),
      }));
    const [first] = stops;
    const last = stops.at(-1);
    if (!first?.state || !last?.state) throw new Error("no drinking");

    expect(last.thirst).toBeLessThan(first.thirst);
    expect(last.state.contributions.thirst).toBeGreaterThan(first.state.contributions.thirst);
    expect(last.state.hazard).toBeGreaterThan(first.state.hazard);
    const ended = firedTransitions.find((fired) => fired.from === "drinking");
    expect(ended?.transition).toBe("drinking-to-immobility");
    expect(ended?.thirst).toBeCloseTo(
      samples.find((sample) => sample.step >= (ended?.step ?? 0))?.thirst ?? -1,
      2,
    );
  });

  it("doesn't end any sooner for having gone on longer (ADR-0001)", () => {
    // With no intake Thirst can't fall, so nothing but time in the bout could raise the hazard.
    const parameters = { ...DEFAULT_PARAMETERS, drinkingIntake: 0 };
    const hazards = recordOf(4, 10 * MINUTE, waterUnderFly(4, { parameters }))
      .samples.filter((sample) => sample.behaviour === "drinking")
      .map(
        (sample) =>
          sample.transitions.find((state) => state.transition === "drinking-to-immobility")
            ?.hazard ?? NaN,
      );

    expect(hazards.length).toBeGreaterThan(10);
    for (let i = 1; i < hazards.length; i++) {
      expect(hazards[i]).toBeLessThanOrEqual(hazards[i - 1] ?? 0);
    }
  });

  it("has per-Driver contributions that add up to the hazard, Thirst included", () => {
    const { samples, firedTransitions } = recordOf(4, HOUR, waterUnderFly(4));
    const states = [...samples.flatMap((sample) => sample.transitions), ...firedTransitions];

    expect(states.some((state) => state.contributions.thirst > 0)).toBe(true);
    for (const state of states) {
      const total = DRIVERS.reduce((sum, driver) => sum + state.contributions[driver], 0);
      expect(total).toBeCloseTo(state.hazard, 12);
      expect(state.fireProbabilityNextMinute).toBeCloseTo(1 - Math.exp(-state.hazard * 60), 12);
    }
  });
});
