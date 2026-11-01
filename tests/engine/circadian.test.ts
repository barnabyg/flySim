import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM,
  createSimulationRun,
  type FiredTransition,
  type LightSchedule,
  type RunSample,
} from "../../src/engine";

const HOUR = 3600;
const DAY = 24 * HOUR;
const SEEDS = [11, 12, 13, 14, 15, 16];
const DAYS = 3;

interface SleepBout {
  readonly start: number;
  readonly end: number;
}

function sleepBoutsOf(fired: readonly FiredTransition[]): SleepBout[] {
  const bouts: SleepBout[] = [];
  let start: number | undefined;
  for (const { from, to, timeSeconds } of fired) {
    if (to === "sleeping") start = timeSeconds;
    if (from === "sleeping" && start !== undefined) {
      bouts.push({ start, end: timeSeconds });
      start = undefined;
    }
  }
  return bouts;
}

/** The share of a stretch of the run spent asleep. */
function sleepShare(bouts: readonly SleepBout[], from: number, to: number): number {
  const asleep = bouts.reduce(
    (sum, bout) => sum + Math.max(0, Math.min(bout.end, to) - Math.max(bout.start, from)),
    0,
  );
  return asleep / (to - from);
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

describe("the circadian clock's shape of sleep", () => {
  // Hours are since lights-on, and each day's shares are pooled over the seeds.
  let runs: SleepBout[][] = [];
  const shareBetween = (fromHour: number, toHour: number, day: number): number =>
    mean(
      runs.map((bouts) =>
        sleepShare(bouts, day * DAY + fromHour * HOUR, day * DAY + toHour * HOUR),
      ),
    );

  beforeAll(() => {
    runs = SEEDS.map((seed) => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed, maxRecordedSamples: 1 });
      run.advanceSeconds(DAYS * DAY);
      return sleepBoutsOf(run.firedTransitions);
    });
  }, 300_000);

  it.each([0, 1, 2])("has a midday siesta on day %i", (day) => {
    const midday = shareBetween(4, 8, day);

    expect(midday).toBeGreaterThan(shareBetween(0, 2, day));
    expect(midday).toBeGreaterThan(shareBetween(10, 12, day));
  });

  it.each([0, 1, 2])("sleeps more by night than by day on day %i", (day) => {
    expect(shareBetween(12, 24, day)).toBeGreaterThan(shareBetween(0, 12, day));
  });

  it("has longer sleep bouts by night than by day", () => {
    const bouts = runs.flat();
    const lengths = (isNight: boolean): number[] =>
      bouts
        .filter((bout) => bout.start % DAY >= 12 * HOUR === isNight)
        .map((bout) => bout.end - bout.start);

    expect(lengths(false).length).toBeGreaterThan(20);
    expect(lengths(true).length).toBeGreaterThan(20);
    expect(mean(lengths(true))).toBeGreaterThan(mean(lengths(false)));
  });

  it("varies between seeds and days rather than following a timetable", () => {
    const firstSleeps = runs.map((bouts) => bouts[0]?.start ?? NaN);
    expect(new Set(firstSleeps).size).toBe(SEEDS.length);

    const nightShares = runs.map((bouts) => sleepShare(bouts, 12 * HOUR, DAY));
    expect(new Set(nightShares).size).toBe(SEEDS.length);

    for (const bouts of runs) {
      const middayByDay = [0, 1, 2].map((day) =>
        sleepShare(bouts, day * DAY + 4 * HOUR, day * DAY + 8 * HOUR),
      );
      expect(new Set(middayByDay).size).toBe(DAYS);
    }

    // At the same time of day, some runs are asleep and others are awake.
    const asleepAtMidday = runs.map((bouts) =>
      bouts.some((bout) => bout.start <= 6 * HOUR && bout.end > 6 * HOUR),
    );
    const anyDayMixed = [0, 1, 2].some((day) => {
      const noon = day * DAY + 6 * HOUR;
      const asleep = runs.map((bouts) =>
        bouts.some((bout) => bout.start <= noon && bout.end > noon),
      );
      return new Set(asleep).size === 2;
    });
    expect(asleepAtMidday).toHaveLength(SEEDS.length);
    expect(anyDayMixed).toBe(true);
  });
});

describe("the circadian clock", () => {
  function samplesOf(simulatedSeconds: number, lightSchedule?: LightSchedule): RunSample[] {
    const run = createSimulationRun({
      room: DEFAULT_ROOM,
      seed: 21,
      ...(lightSchedule ? { lightSchedule } : {}),
    });
    run.advanceSeconds(simulatedSeconds);
    return [...run.record().samples];
  }

  it("exposes a phase that keeps close to the hours since lights-on", () => {
    const samples = samplesOf(30 * HOUR);

    for (const { circadianPhaseHours, timeSeconds } of samples) {
      expect(circadianPhaseHours).toBeGreaterThanOrEqual(0);
      expect(circadianPhaseHours).toBeLessThan(24);
      const sinceLightsOn = (timeSeconds / HOUR) % 24;
      const gap = Math.abs(circadianPhaseHours - sinceLightsOn);
      expect(Math.min(gap, 24 - gap)).toBeLessThan(0.5);
    }
  });

  it("is a Driver of its own on both sleep hazards", () => {
    const samples = samplesOf(12 * HOUR);
    const circadianOn = (transition: string): number[] =>
      samples.flatMap((sample) =>
        sample.transitions
          .filter((state) => state.transition === transition)
          .map((state) => state.contributions.circadian),
      );

    expect(Math.max(...circadianOn("immobility-to-sleeping"))).toBeGreaterThan(0);
    expect(Math.max(...circadianOn("sleeping-to-immobility"))).toBeGreaterThan(0);
    expect(Math.max(...circadianOn("immobility-to-walking"))).toBe(0);
  });

  it("doesn't read the Room's light, so a schedule changes only the Room", () => {
    const withoutRoomLight = (lightSchedule: LightSchedule): unknown[] => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 3, lightSchedule });
      run.advanceSeconds(14 * HOUR);
      return run.record().samples.map((sample) => ({
        ...sample,
        lightLevel: undefined,
        senses: undefined,
      }));
    };

    expect(withoutRoomLight({ lightsOnHour: 6, lightHours: 0 })).toEqual(
      withoutRoomLight({ lightsOnHour: 6, lightHours: 12 }),
    );
  });
});
