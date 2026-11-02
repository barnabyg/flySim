import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM,
  STEPS_PER_SECOND,
  createSimulationRun,
  type FiredTransition,
  type Intervention,
  type RunRecord,
} from "../../src/engine";

const HOUR = 3600;
const SEEDS = [31, 32, 33, 34, 35];
/** Long enough to see the day after deprivation and the start of the one after that. */
const RUN_HOURS = 54;
/** Frequent enough to wake the fly from the light sleep it falls into. */
const DISTURB_EVERY_SECONDS = 60;

/** Disturbs the fly every minute, from one hour since lights-on to another. */
function deprivation(fromHour: number, toHour: number): Intervention[] {
  const interventions: Intervention[] = [];
  for (let time = fromHour * HOUR; time < toHour * HOUR; time += DISTURB_EVERY_SECONDS) {
    interventions.push({ step: time * STEPS_PER_SECOND, type: "disturb" });
  }
  return interventions;
}

interface Outcome {
  readonly fired: readonly FiredTransition[];
  readonly interventions: RunRecord["interventions"];
  /** Sleep pressure from the run record on each hour, from the start of the run. */
  readonly sleepPressureByHour: readonly number[];
}

function runWith(seed: number, interventions: readonly Intervention[]): Outcome {
  const run = createSimulationRun({
    room: DEFAULT_ROOM,
    seed,
    interventions,
    maxRecordedSamples: 1,
  });
  // The record keeps only its latest sample, so it is read as the run reaches each hour.
  const sleepPressureByHour: number[] = [];
  for (let hour = 0; hour < RUN_HOURS; hour++) {
    sleepPressureByHour.push(run.record().samples.at(-1)?.sleepPressure ?? NaN);
    run.advanceSeconds(HOUR);
  }
  return {
    fired: run.firedTransitions,
    interventions: run.record().interventions,
    sleepPressureByHour,
  };
}

/** The share of a stretch of the run, in hours since the first lights-on, spent asleep. */
function sleepShare(fired: readonly FiredTransition[], fromHour: number, toHour: number): number {
  const [from, to] = [fromHour * HOUR, toHour * HOUR];
  let asleep = 0;
  let start: number | undefined;
  for (const { from: left, to: entered, timeSeconds } of fired) {
    if (entered === "sleeping") start = timeSeconds;
    if (left === "sleeping" && start !== undefined) {
      asleep += Math.max(0, Math.min(timeSeconds, to) - Math.max(start, from));
      start = undefined;
    }
  }
  if (start !== undefined) asleep += Math.max(0, to - Math.max(start, from));
  return asleep / (to - from);
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

describe("rebound after lost sleep", () => {
  // Deprivation ends at the second lights-on, 24 hours in, so the following day is the rebound.
  let undisturbed: Outcome[] = [];
  let lostNight: Outcome[] = [];
  let lostHalfNight: Outcome[] = [];
  const pooledShare = (outcomes: readonly Outcome[], fromHour: number, toHour: number) =>
    mean(outcomes.map(({ fired }) => sleepShare(fired, fromHour, toHour)));

  beforeAll(() => {
    undisturbed = SEEDS.map((seed) => runWith(seed, []));
    lostNight = SEEDS.map((seed) => runWith(seed, deprivation(12, 24)));
    lostHalfNight = SEEDS.map((seed) => runWith(seed, deprivation(18, 24)));
  }, 600_000);

  it("deprives the fly with timed Disturb interventions alone", () => {
    for (const { interventions } of lostNight) {
      expect(interventions).toEqual(deprivation(12, 24));
      expect(new Set(interventions.map(({ type }) => type))).toEqual(new Set(["disturb"]));
    }
    expect(pooledShare(lostNight, 12, 24)).toBeLessThan(0.2 * pooledShare(undisturbed, 12, 24));
  });

  it("holds sleep pressure higher during deprivation than at the same time undisturbed", () => {
    const pressure = (outcomes: readonly Outcome[], index: number, hour: number): number =>
      outcomes[index]?.sleepPressureByHour[hour] ?? NaN;
    SEEDS.forEach((_, index) => {
      // From an hour in, when a fly left alone may have slept, to the end of the deprivation.
      for (let hour = 13; hour < 24; hour++) {
        expect(pressure(lostNight, index, hour)).toBeGreaterThanOrEqual(
          pressure(undisturbed, index, hour),
        );
      }
      for (let hour = 19; hour < 24; hour++) {
        expect(pressure(lostHalfNight, index, hour)).toBeGreaterThanOrEqual(
          pressure(undisturbed, index, hour),
        );
      }
      expect(pressure(lostNight, index, 23)).toBeGreaterThan(
        pressure(undisturbed, index, 23) + 0.3,
      );
      expect(pressure(lostHalfNight, index, 23)).toBeGreaterThan(
        pressure(undisturbed, index, 23) + 0.2,
      );
    });
  });

  it("sleeps more after deprivation than undisturbed, over the same clock hours", () => {
    expect(pooledShare(lostNight, 24, 30)).toBeGreaterThan(pooledShare(undisturbed, 24, 30) + 0.1);
    expect(pooledShare(lostHalfNight, 24, 30)).toBeGreaterThan(pooledShare(undisturbed, 24, 30));
    // Most seeds show it on their own, not only when pooled.
    const reboundingSeeds = SEEDS.filter(
      (_, index) =>
        sleepShare(lostNight[index]?.fired ?? [], 24, 30) >
        sleepShare(undisturbed[index]?.fired ?? [], 24, 30),
    );
    expect(reboundingSeeds.length).toBeGreaterThanOrEqual(SEEDS.length - 1);
  });

  it("gives at least as much rebound after longer deprivation", () => {
    expect(pooledShare(lostNight, 24, 30)).toBeGreaterThanOrEqual(
      pooledShare(lostHalfNight, 24, 30),
    );
  });

  it("fades, so later days return towards the undisturbed pattern", () => {
    const extra = (fromHour: number, toHour: number): number =>
      pooledShare(lostNight, fromHour, toHour) - pooledShare(undisturbed, fromHour, toHour);

    expect(extra(30, 36)).toBeLessThan(extra(24, 30));
    expect(Math.abs(extra(48, 54))).toBeLessThan(extra(24, 30) / 2);
    expect(Math.abs(extra(48, 54))).toBeLessThan(0.1);
  });

  it("comes from sleep pressure, through the same hazards", () => {
    // Every run uses the default parameters, so there's no rule for rebound to switch on.
    const reboundOnsets = (outcomes: readonly Outcome[]): FiredTransition[] =>
      outcomes.flatMap(({ fired }) =>
        fired.filter(
          (each) =>
            each.to === "sleeping" && each.timeSeconds >= 24 * HOUR && each.timeSeconds < 30 * HOUR,
        ),
      );
    const meanOf = (onsets: readonly FiredTransition[], value: (each: FiredTransition) => number) =>
      mean(onsets.map(value));

    const deprived = reboundOnsets(lostNight);
    const rested = reboundOnsets(undisturbed);
    expect(meanOf(deprived, (each) => each.sleepPressure)).toBeGreaterThan(
      meanOf(rested, (each) => each.sleepPressure) + 0.1,
    );
    // The bar's sleep pressure segment is what pushed those onsets harder.
    expect(meanOf(deprived, (each) => each.contributions.sleepPressure)).toBeGreaterThan(
      meanOf(rested, (each) => each.contributions.sleepPressure),
    );
    for (const each of deprived) {
      expect(each.contributions.startle).toBe(0);
    }
  });
});
