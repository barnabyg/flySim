import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM, createSimulationRun, type SimulationSetup } from "../../src/engine";

const HOUR = 3600;
const SEEDS = [11, 12, 13, 14, 15, 16];

/** Hunger and Thirst on each hour of a day, and the trips made, keeping only the latest sample. */
function dayOf(seed: number, setup: Partial<SimulationSetup> = {}) {
  const run = createSimulationRun({ room: DEFAULT_ROOM, ...setup, seed, maxRecordedSamples: 1 });
  const hourly: { hunger: number; thirst: number }[] = [];
  for (let hour = 0; hour <= 24; hour++) {
    const { hunger, thirst } = run.current();
    hourly.push({ hunger, thirst });
    run.advanceSeconds(HOUR);
  }
  const trips = (to: string) => run.firedTransitions.filter((fired) => fired.to === to).length;
  return { hourly, feeds: trips("feeding"), drinks: trips("drinking"), death: run.current().death };
}

/** Each seed's default day, run once and shared by the tests that need it. */
const defaultDays = new Map<number, ReturnType<typeof dayOf>>();
function defaultDayOf(seed: number) {
  let day = defaultDays.get(seed);
  if (!day) {
    day = dayOf(seed);
    defaultDays.set(seed, day);
  }
  return day;
}

describe("the daily loop", () => {
  for (const seed of SEEDS) {
    it(`finds food and water by searching within a simulated day, seed ${seed}`, () => {
      const { feeds, drinks, death } = defaultDayOf(seed);

      expect(death).toBeNull();
      expect(feeds).toBeGreaterThanOrEqual(1);
      expect(drinks).toBeGreaterThanOrEqual(1);
    });
  }

  it("makes a fly kept from food hungrier, and one with food less hungry", () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const kept = dayOf(seed, { food: null }).hourly;
      const fed = defaultDayOf(seed).hourly;
      const [start] = kept;
      if (!start) throw new Error("no samples");

      expect(kept.at(-1)?.hunger).toBeGreaterThan(start.hunger + 0.1);
      expect(fed.at(-1)?.hunger).toBeLessThan(kept.at(-1)?.hunger ?? 0);
      // Between trips Hunger rises, and a trip brings it back down.
      expect(Math.min(...fed.map((each) => each.hunger))).toBeLessThan(start.hunger);
    }
  });

  it("makes a fly kept from water thirstier, and one with water less thirsty", () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const kept = dayOf(seed, { water: null }).hourly;
      const watered = defaultDayOf(seed).hourly;
      const [start] = kept;
      if (!start) throw new Error("no samples");

      expect(kept.at(-1)?.thirst).toBeGreaterThan(start.thirst + 0.1);
      expect(watered.at(-1)?.thirst).toBeLessThan(kept.at(-1)?.thirst ?? 0);
      expect(Math.min(...watered.map((each) => each.thirst))).toBeLessThan(start.thirst);
    }
  });
});
