import { describe, expect, it } from "vitest";
import { createSimulationRun } from "../../src/engine";
import {
  ACTIVITY_MONITOR,
  assaySetup,
  disagreementOf,
  observeFly,
  poolDisagreement,
  scoreActivity,
  vigilanceRecord,
  type VigilanceRecord,
} from "../../src/validation";

const MINUTE = 60;
const HOUR = 3600;

/** A day of one-minute bins, all active except the given spans, in minutes from lights-on. */
function dayActiveExcept(still: readonly [from: number, to: number][]): boolean[] {
  const active = Array<boolean>(24 * 60).fill(true);
  for (const [from, to] of still) active.fill(false, from, to);
  return active;
}

function sleepAt(spans: readonly [from: number, to: number][]): VigilanceRecord {
  return {
    startSeconds: 0,
    durationSeconds: 24 * HOUR,
    sleep: spans.map(([from, to]) => ({
      startSeconds: from * MINUTE,
      durationSeconds: (to - from) * MINUTE,
    })),
  };
}

const RULE = { sleepThresholdMinutes: 5 };

// Four Inactivity Bouts: 01:00–01:20, 02:00–02:04, 10:00–10:30 and 21:40–21:50 after lights-on.
// All but the 4-minute one are Scored Sleep, 60 minutes in all.
const scored = scoreActivity(
  dayActiveExcept([
    [60, 80],
    [120, 124],
    [600, 630],
    [1300, 1310],
  ]),
  MINUTE,
  0,
  RULE,
);
// True sleep: the last 15 minutes of the first bout, 2 minutes inside the 4-minute bout, none in
// the 30-minute bout, and from 2 minutes into the last bout until 3 minutes after it ends.
const truth = sleepAt([
  [65, 80],
  [121, 123],
  [1302, 1313],
]);

describe("Scoring Disagreement", () => {
  const disagreement = disagreementOf(scored, truth, RULE);

  it("gives the share of Scored Sleep during which the fly was awake", () => {
    expect(disagreement.scoredSleepMinutesPerDay).toBe(60);
    // 5 minutes at 01:00, all 30 at 10:00 and 2 at 21:40.
    expect(disagreement.awakeScoredAsSleep.minutesPerDay).toBe(37);
    expect(disagreement.awakeScoredAsSleep.share).toBeCloseTo(37 / 60, 10);
  });

  it("gives the share of true sleep that wasn't scored as sleep", () => {
    expect(disagreement.trueSleepMinutesPerDay).toBe(28);
    // 2 minutes inside the 4-minute bout, and 3 after the last bout.
    expect(disagreement.sleepNotScored.minutesPerDay).toBe(5);
    expect(disagreement.sleepNotScored.share).toBeCloseTo(5 / 28, 10);
  });

  it("counts awake stretches of at least 5 minutes scored as sleep, and sleep missed entirely", () => {
    // The 5 minutes at 01:00 and the 30 at 10:00, but not the 2 at 21:40.
    expect(disagreement.awakeScoredAsSleep.boutsPerDay).toBe(2);
    // The sleep inside the 4-minute bout. The last one was scored in part.
    expect(disagreement.sleepNotScored.boutsPerDay).toBe(1);
  });

  it("breaks each direction down by the hour of the day", () => {
    const hours = (entries: Record<number, number>) =>
      Array.from({ length: 24 }, (_, hour) => entries[hour] ?? 0);
    expect(disagreement.awakeScoredAsSleep.minutesByHour).toEqual(hours({ 1: 5, 10: 30, 21: 2 }));
    expect(disagreement.awakeScoredAsSleep.boutsByHour).toEqual(hours({ 1: 1, 10: 1 }));
    expect(disagreement.sleepNotScored.minutesByHour).toEqual(hours({ 2: 2, 21: 3 }));
    expect(disagreement.sleepNotScored.boutsByHour).toEqual(hours({ 2: 1 }));
  });

  it("splits a stretch that crosses an hour between the two hours", () => {
    const crossing = disagreementOf(
      scoreActivity(dayActiveExcept([[110, 130]]), MINUTE, 0, RULE),
      sleepAt([]),
      RULE,
    );
    expect(crossing.awakeScoredAsSleep.minutesByHour.slice(1, 3)).toEqual([10, 10]);
    expect(crossing.awakeScoredAsSleep.boutsByHour[1]).toBe(1);
  });

  it("pools flies by their time together, and averages the rest per fly", () => {
    const allAsleep = disagreementOf(
      scored,
      sleepAt([
        [60, 80],
        [600, 630],
        [1300, 1310],
      ]),
      RULE,
    );
    const pooled = poolDisagreement([disagreement, allAsleep]);

    expect(allAsleep.awakeScoredAsSleep.share).toBe(0);
    expect(pooled.awakeScoredAsSleep.minutesPerDay).toBe(18.5);
    expect(pooled.awakeScoredAsSleep.share).toBeCloseTo(37 / 120, 10);
    expect(pooled.sleepNotScored.share).toBeCloseTo(5 / (28 + 60), 10);
    expect(pooled.awakeScoredAsSleep.boutsPerDay).toBe(1);
    expect(pooled.awakeScoredAsSleep.minutesByHour[10]).toBe(15);
  });
});

describe("the true Vigilance State beside an assay", () => {
  it("comes from the run's fired transitions, matching what its samples say", () => {
    // From late morning into the siesta, when a fly sleeps on and off.
    const run = createSimulationRun({
      ...assaySetup(ACTIVITY_MONITOR.study, 4),
      maxRecordedSamples: Infinity,
    });
    run.advanceSeconds(4 * HOUR);
    const start = run.current();
    run.advanceSeconds(4 * HOUR);
    const record = run.record();
    const vigilance = vigilanceRecord(
      start.vigilanceState,
      record.firedTransitions,
      start.timeSeconds,
      run.current().timeSeconds,
    );
    const asleepSamples = record.samples.filter(
      (sample) => sample.timeSeconds > start.timeSeconds && sample.vigilanceState === "asleep",
    ).length;
    const asleepSeconds = vigilance.sleep.reduce((sum, bout) => sum + bout.durationSeconds, 0);

    expect(asleepSamples).toBeGreaterThan(10 * MINUTE);
    // A sample a second, so they agree to within a second a bout.
    expect(Math.abs(asleepSeconds - asleepSamples)).toBeLessThanOrEqual(vigilance.sleep.length);
  });

  it("is recorded over the same span as the instruments, apart from what they see", () => {
    const study = { ...ACTIVITY_MONITOR.study, acclimationHours: 0, recordedDays: 1 / 24 };
    const recording = observeFly(study, [ACTIVITY_MONITOR.instrument], 2);
    const [observation] = recording.observations;

    expect(recording.vigilance.startSeconds).toBe(observation?.startSeconds);
    expect(recording.vigilance.durationSeconds).toBe(HOUR);
    expect(JSON.stringify(observation)).not.toMatch(/sleep|vigilance|asleep/i);
  });
});
