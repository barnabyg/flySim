import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM,
  DRIVERS,
  createSimulationRun,
  type Behaviour,
  type FiredTransition,
  type RunRecord,
} from "../../src/engine";

const HOUR = 3600;
/** The conventional cut-off at which a lab scores an Inactivity Bout as sleep. */
const SCORED_SLEEP_SECONDS = 5 * 60;
const SEEDS = [51, 52, 53, 54, 55, 56];

interface Bout {
  readonly behaviour: Behaviour;
  readonly seconds: number;
  /** The firing that ended the bout. */
  readonly ended: FiredTransition;
}

/** Every complete bout of a behaviour, from the firing that began it to the one that ended it. */
function boutsOf(fired: readonly FiredTransition[]): Bout[] {
  return fired.slice(1).flatMap((ended, index) => {
    const began = fired[index];
    return began
      ? [{ behaviour: ended.from, seconds: ended.timeSeconds - began.timeSeconds, ended }]
      : [];
  });
}

describe("where true sleep and Scored Sleep disagree", () => {
  // Default runs with no interventions, over a whole day each.
  let records: RunRecord[] = [];
  let bouts: Bout[] = [];

  beforeAll(() => {
    records = SEEDS.map((seed) => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed, maxRecordedSamples: 1 });
      run.advanceSeconds(24 * HOUR);
      return run.record();
    });
    bouts = records.flatMap((record) => boutsOf(record.firedTransitions));
  }, 300_000);

  const longestIn = (seedBouts: readonly Bout[], behaviour: Behaviour): number =>
    Math.max(0, ...seedBouts.filter((bout) => bout.behaviour === behaviour).map((b) => b.seconds));

  it("has awake Immobility lasting longer than 5 minutes", () => {
    const long = bouts.filter(
      (bout) => bout.behaviour === "immobility" && bout.seconds > SCORED_SLEEP_SECONDS,
    );

    expect(long.length).toBeGreaterThan(10);
    // In most runs, not only in a few.
    const seedsWithOne = records.filter(
      (record) => longestIn(boutsOf(record.firedTransitions), "immobility") > SCORED_SLEEP_SECONDS,
    );
    expect(seedsWithOne.length).toBeGreaterThanOrEqual(SEEDS.length - 1);
  });

  it("has sleep bouts shorter than 5 minutes", () => {
    const short = bouts.filter(
      (bout) => bout.behaviour === "sleeping" && bout.seconds < SCORED_SLEEP_SECONDS,
    );

    expect(short.length).toBeGreaterThan(10);
    const seedsWithOne = records.filter((record) =>
      boutsOf(record.firedTransitions).some(
        (bout) => bout.behaviour === "sleeping" && bout.seconds < SCORED_SLEEP_SECONDS,
      ),
    );
    expect(seedsWithOne.length).toBeGreaterThanOrEqual(SEEDS.length - 1);
  });

  it("records awake Immobility, grooming in place and sleep as separate states", () => {
    for (const record of records) {
      const { immobility, grooming, sleeping } = record.timeInBehaviourSeconds;
      expect(immobility).toBeGreaterThan(0);
      expect(grooming).toBeGreaterThan(0);
      expect(sleeping).toBeGreaterThan(0);
    }
    // All three look motionless to a camera, and only the true Vigilance State tells them apart.
    for (const bout of bouts) {
      if (bout.ended.to === "sleeping") expect(bout.ended.vigilanceState).toBe("asleep");
      if (bout.ended.to === "immobility" || bout.ended.to === "grooming") {
        expect(bout.ended.vigilanceState).toBe("awake");
      }
    }
  });

  it("leaves a long period of stillness with no intervention, and records why", () => {
    const left = bouts.filter(
      (bout) =>
        bout.behaviour === "immobility" &&
        bout.seconds > SCORED_SLEEP_SECONDS &&
        bout.ended.to !== "sleeping",
    );

    expect(records.every((record) => record.interventions.length === 0)).toBe(true);
    expect(left.length).toBeGreaterThan(5);
    for (const { ended } of left) {
      const total = DRIVERS.reduce((sum, driver) => sum + ended.contributions[driver], 0);
      expect(total).toBeCloseTo(ended.hazard, 12);
      expect(ended.hazard).toBeGreaterThan(0);
      expect(ended.contributions.startle).toBe(0);
      expect(ended.triggerLevel).toBeGreaterThan(0);
    }
    // The fly leaves for different destinations, pushed by different Drivers.
    expect(new Set(left.map(({ ended }) => ended.to)).size).toBeGreaterThan(1);
  });
});
