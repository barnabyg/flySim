import { describe, expect, it } from "vitest";
import {
  DRIVERS,
  TRANSITIONS,
  createSimulationRun,
  type Chamber,
  type RunRecord,
  type SimulationSetup,
} from "../../src/engine";

const DAY = 86_400;

/** An activity-monitor tube, 65 mm long and 5 mm across, with a food plug at its west end. */
const TUBE: Chamber = {
  name: "activity-monitor tube",
  flightPossible: false,
  sourceReachMetres: 0.004,
};
const TUBE_SIZE = { widthMetres: 0.065, depthMetres: 0.005, heightMetres: 0.005 };
/** A food plug gives both food and water, so both are at the same end. */
const PLUG = { x: 0, y: 0.0025 };

function tubeSetup(seed: number): SimulationSetup {
  return { room: TUBE_SIZE, chamber: TUBE, seed, food: PLUG, water: PLUG };
}

function recordInTube(seed: number, seconds: number): RunRecord {
  const run = createSimulationRun(tubeSetup(seed));
  run.advanceSeconds(seconds);
  return run.record();
}

const SEEDS = [1, 2, 3, 4];
const records = new Map<number, RunRecord>();
function dayInTube(seed: number): RunRecord {
  let record = records.get(seed);
  if (!record) {
    record = recordInTube(seed, DAY);
    records.set(seed, record);
  }
  return record;
}

describe("a fly in a study's chamber", () => {
  it("stays inside a tube far smaller than the Room, on every surface, for a day", () => {
    for (const seed of SEEDS) {
      const record = dayInTube(seed);
      expect(record.death).toBeNull();
      expect(record.step).toBe(DAY * record.stepsPerSecond);
      for (const { position, surface } of record.samples) {
        expect(surface).not.toBeNull();
        expect(position.x).toBeGreaterThanOrEqual(0);
        expect(position.x).toBeLessThanOrEqual(TUBE_SIZE.widthMetres);
        expect(position.y).toBeGreaterThanOrEqual(0);
        expect(position.y).toBeLessThanOrEqual(TUBE_SIZE.depthMetres);
        expect(position.z).toBeGreaterThanOrEqual(0);
        expect(position.z).toBeLessThanOrEqual(TUBE_SIZE.heightMetres);
      }
      // It gets around the tube rather than staying on the floor.
      const surfaces = new Set(record.samples.map((sample) => sample.surface));
      for (const each of ["floor", "ceiling", "south-wall", "north-wall"] as const) {
        expect(surfaces, `seed ${seed}`).toContain(each);
      }
    }
  });

  it("never takes off in a chamber where flight is impossible", () => {
    const takeOffs = TRANSITIONS.filter((each) => each.to === "flying").map((each) => each.id);
    expect(takeOffs.length).toBeGreaterThan(0);
    for (const seed of SEEDS) {
      const record = dayInTube(seed);
      expect(record.timeInBehaviourSeconds.flying).toBe(0);
      expect(record.firedTransitions.some((each) => each.to === "flying")).toBe(false);
      for (const sample of record.samples) {
        for (const transition of sample.transitions) {
          expect(takeOffs).not.toContain(transition.transition);
          // The remaining transitions' Driver contributions still add up to their hazards.
          const total = DRIVERS.reduce((sum, driver) => sum + transition.contributions[driver], 0);
          expect(total).toBeCloseTo(transition.hazard, 12);
        }
      }
      // Walking is still available, so only take-off is gone.
      expect(
        record.samples.some((sample) =>
          sample.transitions.some((each) => each.transition === "immobility-to-walking"),
        ),
      ).toBe(true);
    }
  });

  it("finds food and water sharing one end of the tube, and feeds and drinks there", () => {
    for (const seed of SEEDS) {
      const record = dayInTube(seed);
      expect(record.timeInBehaviourSeconds.feeding, `seed ${seed}`).toBeGreaterThan(0);
      expect(record.timeInBehaviourSeconds.drinking, `seed ${seed}`).toBeGreaterThan(0);
      const intake = record.firedTransitions.filter(
        (each) => each.to === "feeding" || each.to === "drinking",
      );
      // Only at the plug's end.
      for (const each of intake) {
        const sample = record.samples.find((s) => s.step >= each.step);
        if (sample) expect(sample.position.x).toBeLessThan(0.01);
      }
    }
  });

  it("is reproducible from its seed and setup, and its Run Record shows the chamber", () => {
    const record = recordInTube(9, 3600);
    expect(record.chamber).toEqual(TUBE);
    expect(record.room).toEqual(TUBE_SIZE);
    expect(recordInTube(9, 3600)).toEqual(record);
  });

  it("shows no chamber for a run in the Room", () => {
    const run = createSimulationRun({
      room: { widthMetres: 1, depthMetres: 1, heightMetres: 0.6 },
      seed: 1,
    });
    expect(run.record().chamber).toBeNull();
  });

  it("refuses a chamber with no reach for its sources", () => {
    expect(() =>
      createSimulationRun({ ...tubeSetup(1), chamber: { ...TUBE, sourceReachMetres: 0 } }),
    ).toThrow(/reach/);
  });
});
