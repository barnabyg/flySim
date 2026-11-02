import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  createSimulationRun,
  type FloorPlace,
  SOURCE_RADIUS_METRES,
  type SimulationSetup,
} from "../../src/engine";
import { recordOf } from "./helpers";

const MINUTE = 60;
const HOUR = 3600;

describe("food in the Room", () => {
  it("takes the food's place from the setup and keeps it in the run record", () => {
    const food: FloorPlace = { x: 0.2, y: 0.7 };
    const record = recordOf(1, 1, { food });

    expect(record.food).toEqual(food);
    expect(record.samples[0]?.food).toEqual(food);
  });

  it("puts the food on the floor away from the walls by default", () => {
    const { food } = recordOf(1, 1);
    if (!food) throw new Error("no food");

    expect(food.x).toBeGreaterThan(0.1);
    expect(food.x).toBeLessThan(DEFAULT_ROOM.widthMetres - 0.1);
    expect(food.y).toBeGreaterThan(0.1);
    expect(food.y).toBeLessThan(DEFAULT_ROOM.depthMetres - 0.1);
  });

  it("refuses a place off the floor", () => {
    expect(() =>
      createSimulationRun({ room: DEFAULT_ROOM, seed: 1, food: { x: 2, y: 0.5 } }),
    ).toThrow();
  });
});

describe("the energy reserve and Hunger", () => {
  it("exposes the reserve and Hunger in every sample, starting part-fed", () => {
    const { samples } = recordOf(1, 10);

    expect(samples[0]?.energy).toBeGreaterThan(0.3);
    expect(samples[0]?.energy).toBeLessThan(0.9);
    for (const sample of samples) {
      expect(sample.hunger).toBeGreaterThan(0);
      expect(sample.hunger).toBeLessThan(1);
    }
  });

  it("runs the reserve down without food, which raises Hunger", () => {
    // The fly can't start feeding, so it takes nothing in.
    const parameters = { ...DEFAULT_PARAMETERS, startFeedingHungerRate: 0 };
    const { samples } = recordOf(3, 2 * HOUR, { parameters });
    const [first] = samples;
    const last = samples.at(-1);
    if (!first || !last) throw new Error("no samples");

    expect(last.energy).toBeLessThan(first.energy);
    expect(last.hunger).toBeGreaterThan(first.hunger);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]?.energy).toBeLessThanOrEqual(samples[i - 1]?.energy ?? 0);
    }
  });
});

describe("Feeding", () => {
  it("starts on the food, refills the reserve while it lasts, and lowers Hunger", () => {
    const run = createSimulationRun(foodUnderFly(4));
    run.advanceSeconds(10 * MINUTE);
    const { samples, firedTransitions } = run.record();
    const feeding = samples.filter((sample) => sample.behaviour === "feeding");

    expect(firedTransitions.some((fired) => fired.to === "feeding")).toBe(true);
    expect(feeding.length).toBeGreaterThan(10);
    for (let i = 1; i < samples.length; i++) {
      const [before, after] = [samples[i - 1], samples[i]];
      if (before?.behaviour !== "feeding" || after?.behaviour !== "feeding") continue;
      // A full reserve can't rise any further, though the bout may not have ended yet.
      if (before.energy === 1) continue;
      expect(after.energy).toBeGreaterThan(before.energy);
      expect(after.hunger).toBeLessThan(before.hunger);
    }
  });

  it("happens only while the fly touches the food", () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    let feedingNearFood = 0;
    for (const seed of seeds) {
      const near = createSimulationRun(foodUnderFly(seed));
      near.advanceSeconds(HOUR);
      for (const sample of near.record().samples) {
        if (sample.behaviour !== "feeding") continue;
        feedingNearFood += 1;
        expect(sample.senses.touchingFood).toBe(true);
        expect(sample.surface).toBe("floor");
        const place = sample.food;
        if (!place) throw new Error("no food");
        expect(Math.hypot(sample.position.x - place.x, sample.position.y - place.y)).toBeLessThan(
          SOURCE_RADIUS_METRES,
        );
      }
      // Wandering, it may or may not find the food, but it can only start on it.
      for (const sample of recordOf(seed, 3 * HOUR).samples) {
        for (const state of sample.transitions) {
          if (state.transition.endsWith("-to-feeding") && !sample.senses.touchingFood) {
            expect(state.hazard).toBe(0);
          }
        }
      }
    }
    expect(feedingNearFood).toBeGreaterThan(0);
  });

  it("keeps the fly still on the food", () => {
    const { samples } = recordOf(4, 10 * MINUTE, foodUnderFly(4));
    const feeding = samples.filter((sample) => sample.behaviour === "feeding");
    expect(feeding.length).toBeGreaterThan(0);
    for (const sample of feeding) expect(sample.speedMetresPerSecond).toBe(0);
    expect(new Set(feeding.map((sample) => sample.position.x)).size).toBe(1);
  });

  it("ends through a hazard that rises as Hunger falls", () => {
    const { samples, firedTransitions } = recordOf(4, 10 * MINUTE, foodUnderFly(4));
    const stops = samples
      .filter((sample) => sample.behaviour === "feeding")
      .map((sample) => ({
        hunger: sample.hunger,
        state: sample.transitions.find((state) => state.transition === "feeding-to-immobility"),
      }));
    const [first] = stops;
    const last = stops.at(-1);
    if (!first?.state || !last?.state) throw new Error("no feeding");

    expect(last.hunger).toBeLessThan(first.hunger);
    expect(last.state.contributions.hunger).toBeGreaterThan(first.state.contributions.hunger);
    expect(last.state.hazard).toBeGreaterThan(first.state.hazard);
    const ended = firedTransitions.find((fired) => fired.from === "feeding");
    expect(ended?.transition).toBe("feeding-to-immobility");
    expect(ended?.hunger).toBeCloseTo(
      samples.find((sample) => sample.step >= (ended?.step ?? 0))?.hunger ?? -1,
      2,
    );
  });

  it("doesn't end any sooner for having gone on longer (ADR-0001)", () => {
    // With no intake Hunger can't fall, so nothing but time in the bout could raise the hazard.
    const parameters = { ...DEFAULT_PARAMETERS, feedingIntake: 0 };
    const run = createSimulationRun(foodUnderFly(4, { parameters }));
    run.advanceSeconds(10 * MINUTE);
    const hazards = run
      .record()
      .samples.filter((sample) => sample.behaviour === "feeding")
      .map(
        (sample) =>
          sample.transitions.find((state) => state.transition === "feeding-to-immobility")
            ?.hazard ?? NaN,
      );

    expect(hazards.length).toBeGreaterThan(10);
    for (let i = 1; i < hazards.length; i++) {
      expect(hazards[i]).toBeLessThanOrEqual(hazards[i - 1] ?? 0);
    }
  });
});

describe("Hunger and walking", () => {
  it("raises the hazards that start walking", () => {
    const startsAt = (initialEnergy: number) => {
      const parameters = { ...DEFAULT_PARAMETERS, initialEnergy };
      const [state] = createSimulationRun({ room: DEFAULT_ROOM, seed: 1, parameters }).current()
        .transitions;
      expect(state?.transition).toBe("immobility-to-walking");
      return state;
    };
    const fed = startsAt(0.95);
    const hungry = startsAt(0.2);

    expect(hungry?.contributions.hunger).toBeGreaterThan(fed?.contributions.hunger ?? Infinity);
    expect(hungry?.hazard).toBeGreaterThan(fed?.hazard ?? Infinity);
  });

  it("makes a hungry fly walk more", () => {
    const walkingShare = (initialEnergy: number) => {
      // Well hydrated, so that Thirst adds little to either.
      const parameters = { ...DEFAULT_PARAMETERS, initialEnergy, initialHydration: 0.95 };
      let walking = 0;
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        // Without food, a hungry fly can only keep looking.
        walking += recordOf(seed, HOUR, { parameters, food: null }).timeInBehaviourSeconds.walking;
      }
      return walking;
    };

    expect(walkingShare(0.15)).toBeGreaterThan(1.2 * walkingShare(0.95));
  });
});

/** A setup with the food right under the fly's feet at the start. */
function foodUnderFly(seed: number, setup: Partial<SimulationSetup> = {}): SimulationSetup {
  const { position } = createSimulationRun({ room: DEFAULT_ROOM, seed }).current();
  return { room: DEFAULT_ROOM, seed, food: { x: position.x, y: position.y }, ...setup };
}
