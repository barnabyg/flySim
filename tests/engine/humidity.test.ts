import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  DRIVERS,
  createSimulationRun,
  type FloorPlace,
  type ModelParameters,
  type RunSample,
  type SimulationSetup,
} from "../../src/engine";
import { recordOf } from "./helpers";

const HOUR = 3600;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const THIRSTY = 0.2;
const HYDRATED = 0.95;

function startOf(seed: number): FloorPlace {
  const { position } = createSimulationRun({ room: DEFAULT_ROOM, seed }).current();
  return { x: position.x, y: position.y };
}

function distanceToWater(sample: RunSample): number {
  if (!sample.water) return Infinity;
  const { x, y, z } = sample.position;
  return Math.hypot(x - sample.water.x, y - sample.water.y, z);
}

/** The water a set distance from where the fly starts, towards the middle of the Room. */
function waterAway(seed: number, metres: number): FloorPlace {
  const start = startOf(seed);
  const [dx, dy] = [0.5 - start.x, 0.5 - start.y];
  const length = Math.hypot(dx, dy) || 1;
  return { x: start.x + (metres * dx) / length, y: start.y + (metres * dy) / length };
}

function withParameters(changes: Partial<ModelParameters>): ModelParameters {
  return { ...DEFAULT_PARAMETERS, ...changes };
}

/** No food, so that only water and humidity are in play. */
function waterOnly(seed: number, water: FloorPlace, parameters: ModelParameters): SimulationSetup {
  return { room: DEFAULT_ROOM, seed, water, food: null, parameters };
}

describe("the Humidity Field", () => {
  it("is sensed in every sample, highest on the water and at the Room's own level beyond range", () => {
    const parameters = withParameters({ startDrinkingThirstRate: 0 });
    const { samples } = recordOf(1, HOUR, { parameters, water: startOf(1) });
    const { globalHumidity, humidityRise, humidityRangeMetres } = parameters;

    expect(samples[0]?.senses.humidity).toBeCloseTo(globalHumidity + humidityRise, 6);
    for (const sample of samples) {
      expect(sample.senses.humidity).toBeGreaterThanOrEqual(globalHumidity);
      if (distanceToWater(sample) > humidityRangeMetres) {
        expect(sample.senses.humidity).toBe(globalHumidity);
      }
    }
    expect(samples.some((sample) => sample.senses.humidity === globalHumidity)).toBe(true);
  });

  it("depends only on where the fly is, not on the fly or what it does", () => {
    const water = startOf(2);
    const readings = [THIRSTY, HYDRATED].flatMap((initialHydration) =>
      recordOf(2, HOUR, {
        water,
        parameters: withParameters({ initialHydration, startDrinkingThirstRate: 0 }),
      }).samples.map((sample) => ({
        distance: distanceToWater(sample),
        humidity: sample.senses.humidity,
      })),
    );
    readings.sort((a, b) => a.distance - b.distance);

    for (let i = 1; i < readings.length; i++) {
      expect(readings[i]?.humidity).toBeLessThanOrEqual((readings[i - 1]?.humidity ?? 0) + 1e-12);
    }
  });
});

describe("searching by humidity", () => {
  /** Seconds until the fly first touches the water, or the time allowed if it never does. */
  function secondsToWater(setup: SimulationSetup, allowedSeconds: number): number {
    const run = createSimulationRun(setup);
    for (let second = 0; second < allowedSeconds; second++) {
      if (run.current().senses.touchingWater) return second;
      run.advanceSeconds(1);
    }
    return allowedSeconds;
  }

  it("brings a thirsty fly within range to the water sooner than without the field", () => {
    const total = (humidityRangeMetres: number) =>
      SEEDS.reduce(
        (sum, seed) =>
          sum +
          secondsToWater(
            waterOnly(
              seed,
              waterAway(seed, 0.15),
              withParameters({ initialHydration: THIRSTY, humidityRangeMetres }),
            ),
            3 * HOUR,
          ),
        0,
      );

    expect(total(DEFAULT_PARAMETERS.humidityRangeMetres)).toBeLessThan(0.6 * total(0));
  });

  it("leaves a fly out of range behaving as if there were no water in the Room", () => {
    let comparedSeconds = 0;
    for (const seed of SEEDS.slice(0, 6)) {
      const parameters = withParameters({ humidityRangeMetres: 0.1 });
      const withWater = recordOf(seed, HOUR, {
        parameters,
        food: null,
        water: { x: 0.95, y: 0.95 },
      });
      const without = recordOf(seed, HOUR, { parameters, food: null, water: null });
      const sensed = withWater.samples.findIndex(
        (sample) => sample.senses.humidity > parameters.globalHumidity,
      );
      const until = sensed === -1 ? withWater.samples.length : sensed;
      const strip = (sample: RunSample) => ({ ...sample, water: null });

      expect(withWater.samples.slice(0, until).map(strip)).toEqual(
        without.samples.slice(0, until).map(strip),
      );
      comparedSeconds += until;
    }
    expect(comparedSeconds).toBeGreaterThan(2 * HOUR);
  });

  it("follows humidity less when hydrated than when thirsty", () => {
    /** How fast the humidity rises, on average, while the fly walks within the field. */
    const climb = (initialHydration: number): number => {
      let rise = 0;
      let seconds = 0;
      for (const seed of SEEDS) {
        const parameters = withParameters({ initialHydration, startDrinkingThirstRate: 0 });
        const { samples } = recordOf(seed, HOUR, waterOnly(seed, waterAway(seed, 0.1), parameters));
        const inField = (sample: RunSample) => sample.senses.humidity > parameters.globalHumidity;
        for (let i = 1; i < samples.length; i++) {
          const [before, after] = [samples[i - 1], samples[i]];
          if (before?.behaviour !== "walking" || after?.behaviour !== "walking") continue;
          if (!inField(before) || !inField(after)) continue;
          rise += after.senses.humidity - before.senses.humidity;
          seconds += 1;
        }
      }
      return rise / seconds;
    };
    const thirsty = climb(THIRSTY);
    const hydrated = climb(HYDRATED);

    expect(thirsty).toBeGreaterThan(0);
    expect(hydrated).toBeLessThan(0.5 * thirsty);
  });
});

describe("Thirst against Hunger", () => {
  /** The hazard of starting to feed at the start of a run with the fly on the food. */
  function startFeeding(initialHydration: number) {
    const { position } = createSimulationRun({ room: DEFAULT_ROOM, seed: 1 }).current();
    const run = createSimulationRun({
      room: DEFAULT_ROOM,
      seed: 1,
      food: { x: position.x, y: position.y },
      parameters: withParameters({ initialEnergy: 0.3, initialHydration }),
    });
    const state = run
      .current()
      .transitions.find((each) => each.transition === "immobility-to-feeding");
    if (!state) throw new Error("no feeding transition");
    return state;
  }

  it("holds back feeding, inside the Drivers", () => {
    const thirsty = startFeeding(THIRSTY);
    const hydrated = startFeeding(HYDRATED);

    expect(thirsty.hazard).toBeLessThan(0.7 * hydrated.hazard);
    // Hunger pushes less when the fly is thirsty, and the parts still add up.
    expect(thirsty.contributions.hunger).toBeLessThan(hydrated.contributions.hunger);
    for (const state of [thirsty, hydrated]) {
      const total = DRIVERS.reduce((sum, driver) => sum + state.contributions[driver], 0);
      expect(total).toBeCloseTo(state.hazard, 12);
    }
  });

  it("has per-Driver contributions that add up to the hazard, humidity included", () => {
    const { samples, firedTransitions } = recordOf(
      3,
      HOUR,
      waterOnly(3, waterAway(3, 0.1), withParameters({ initialHydration: THIRSTY })),
    );
    const states = [...samples.flatMap((sample) => sample.transitions), ...firedTransitions];

    expect(states.some((state) => state.contributions.humidity > 0)).toBe(true);
    for (const state of states) {
      const total = DRIVERS.reduce((sum, driver) => sum + state.contributions[driver], 0);
      expect(total).toBeCloseTo(state.hazard, 12);
    }
  });
});
