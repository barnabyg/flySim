import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  createSimulationRun,
  type FloorPlace,
  type ModelParameters,
  type RunSample,
  type SimulationSetup,
} from "../../src/engine";
import { recordOf } from "./helpers";

const HOUR = 3600;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const HUNGRY = 0.2;
const SATED = 0.95;

function startOf(seed: number): FloorPlace {
  const { position } = createSimulationRun({ room: DEFAULT_ROOM, seed }).current();
  return { x: position.x, y: position.y };
}

function distanceToFood(sample: RunSample): number {
  if (!sample.food) return Infinity;
  const { x, y, z } = sample.position;
  return Math.hypot(x - sample.food.x, y - sample.food.y, z);
}

/** The food a set distance from where the fly starts, towards the middle of the Room. */
function foodAway(seed: number, metres: number): FloorPlace {
  const start = startOf(seed);
  const [dx, dy] = [0.5 - start.x, 0.5 - start.y];
  const length = Math.hypot(dx, dy) || 1;
  return { x: start.x + (metres * dx) / length, y: start.y + (metres * dy) / length };
}

function withParameters(changes: Partial<ModelParameters>): ModelParameters {
  return { ...DEFAULT_PARAMETERS, ...changes };
}

describe("the Odour Field", () => {
  it("is sensed in every sample, strongest on the food and gone beyond its range", () => {
    const parameters = withParameters({ startFeedingHungerRate: 0 });
    const { samples } = recordOf(1, HOUR, { parameters, food: startOf(1) });

    expect(samples[0]?.senses.odour).toBeCloseTo(1, 6);
    for (const sample of samples) {
      expect(sample.senses.odour).toBeGreaterThanOrEqual(0);
      if (distanceToFood(sample) > parameters.odourRangeMetres) expect(sample.senses.odour).toBe(0);
    }
    expect(samples.some((sample) => sample.senses.odour === 0)).toBe(true);
    expect(samples.some((sample) => sample.senses.odour > 0 && sample.senses.odour < 1)).toBe(true);
  });

  it("depends only on where the fly is, not on the fly or what it does", () => {
    const food = startOf(2);
    const readings = [HUNGRY, SATED].flatMap((initialEnergy) =>
      recordOf(2, HOUR, {
        food,
        parameters: withParameters({ initialEnergy, startFeedingHungerRate: 0 }),
      }).samples.map((sample) => ({
        distance: distanceToFood(sample),
        odour: sample.senses.odour,
      })),
    );
    readings.sort((a, b) => a.distance - b.distance);

    for (let i = 1; i < readings.length; i++) {
      expect(readings[i]?.odour).toBeLessThanOrEqual((readings[i - 1]?.odour ?? 0) + 1e-12);
    }
  });
});

describe("searching by odour", () => {
  /** Seconds until the fly first touches the food, or the time allowed if it never does. */
  function secondsToFood(setup: SimulationSetup, allowedSeconds: number): number {
    const run = createSimulationRun(setup);
    for (let second = 0; second < allowedSeconds; second++) {
      if (run.current().senses.touchingFood) return second;
      run.advanceSeconds(1);
    }
    return allowedSeconds;
  }

  it("brings a hungry fly within range to the food sooner than without odour", () => {
    const total = (odourRangeMetres: number) =>
      SEEDS.reduce(
        (sum, seed) =>
          sum +
          secondsToFood(
            {
              room: DEFAULT_ROOM,
              seed,
              food: foodAway(seed, 0.15),
              parameters: withParameters({ initialEnergy: HUNGRY, odourRangeMetres }),
            },
            3 * HOUR,
          ),
        0,
      );

    expect(total(DEFAULT_PARAMETERS.odourRangeMetres)).toBeLessThan(0.6 * total(0));
  });

  it("leaves a fly out of range behaving as if there were no food in the Room", () => {
    let comparedSeconds = 0;
    for (const seed of SEEDS.slice(0, 6)) {
      const parameters = withParameters({ odourRangeMetres: 0.1 });
      const withFood = recordOf(seed, HOUR, { parameters, food: { x: 0.05, y: 0.05 } });
      const without = recordOf(seed, HOUR, { parameters, food: null });
      const sensed = withFood.samples.findIndex((sample) => sample.senses.odour > 0);
      const until = sensed === -1 ? withFood.samples.length : sensed;
      const strip = (sample: RunSample) => ({
        ...sample,
        food: null,
        senses: { ...sample.senses, odour: 0 },
      });

      expect(withFood.samples.slice(0, until).map(strip)).toEqual(
        without.samples.slice(0, until).map(strip),
      );
      comparedSeconds += until;
    }
    expect(comparedSeconds).toBeGreaterThan(2 * HOUR);
  });

  it("follows the odour less when sated than when hungry", () => {
    /** How fast the odour rises, on average, while the fly walks within its range. */
    const climb = (initialEnergy: number): number => {
      let rise = 0;
      let seconds = 0;
      for (const seed of SEEDS) {
        const { samples } = recordOf(seed, HOUR, {
          food: foodAway(seed, 0.1),
          parameters: withParameters({ initialEnergy, startFeedingHungerRate: 0 }),
        });
        for (let i = 1; i < samples.length; i++) {
          const [before, after] = [samples[i - 1], samples[i]];
          if (before?.behaviour !== "walking" || after?.behaviour !== "walking") continue;
          if (before.senses.odour === 0 || after.senses.odour === 0) continue;
          rise += after.senses.odour - before.senses.odour;
          seconds += 1;
        }
      }
      return rise / seconds;
    };
    const hungry = climb(HUNGRY);
    const sated = climb(SATED);

    expect(hungry).toBeGreaterThan(0);
    expect(sated).toBeLessThan(0.5 * hungry);
  });
});
