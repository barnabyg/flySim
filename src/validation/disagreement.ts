/**
 * Scoring Disagreement: how often a Virtual Assay's Scored Sleep disagrees with the fly's true
 * Vigilance State, in both directions. It is the one place the Vigilance State meets an assay's
 * scoring, and it measures the 5-minute rule rather than the model, so no Validation Target uses
 * it. Scoring, measures and targets can't import this module, which lint enforces.
 */
import type { FiredTransition, VigilanceState } from "../engine";
import type { ScoredActivity, ScoringRule } from "./scoring";

const DAY_SECONDS = 86_400;
const HOUR_SECONDS = 3600;

/** A span of simulated seconds from the start of the run. */
interface Interval {
  readonly start: number;
  readonly end: number;
}

/** When the fly was truly asleep while an assay recorded it, which no instrument sees. */
export interface VigilanceRecord {
  readonly startSeconds: number;
  readonly durationSeconds: number;
  /** Each stretch of true sleep, cut off where the record starts and ends. */
  readonly sleep: readonly { readonly startSeconds: number; readonly durationSeconds: number }[];
}

/**
 * The Vigilance State over a recording, from the state it started in and the transitions fired
 * during it.
 */
export function vigilanceRecord(
  startState: VigilanceState,
  fired: readonly Pick<FiredTransition, "timeSeconds" | "vigilanceState">[],
  startSeconds: number,
  endSeconds: number,
): VigilanceRecord {
  const sleep: { startSeconds: number; durationSeconds: number }[] = [];
  let asleepSince = startState === "asleep" ? startSeconds : null;
  for (const each of fired) {
    if (each.timeSeconds <= startSeconds || each.timeSeconds > endSeconds) continue;
    if (each.vigilanceState === "asleep" && asleepSince === null) {
      asleepSince = each.timeSeconds;
    } else if (each.vigilanceState === "awake" && asleepSince !== null) {
      sleep.push({ startSeconds: asleepSince, durationSeconds: each.timeSeconds - asleepSince });
      asleepSince = null;
    }
  }
  if (asleepSince !== null) {
    sleep.push({ startSeconds: asleepSince, durationSeconds: endSeconds - asleepSince });
  }
  return { startSeconds, durationSeconds: endSeconds - startSeconds, sleep };
}

/** One direction of disagreement, per day of the record. */
export interface DisagreementMeasure {
  /**
   * The share of the time it is measured against: of Scored Sleep for awake time scored as sleep,
   * and of true sleep for sleep not scored. Null if there was none of that.
   */
  readonly share: number | null;
  readonly minutesPerDay: number;
  /**
   * Awake stretches scored as sleep that last at least the assay's sleep threshold, or stretches
   * of true sleep none of which was scored as sleep.
   */
  readonly boutsPerDay: number;
  /** Minutes in each hour of the day, from lights-on, averaged over the days. */
  readonly minutesByHour: readonly number[];
  /** Bouts starting in each hour of the day, from lights-on, averaged over the days. */
  readonly boutsByHour: readonly number[];
}

/** How one fly's Scored Sleep disagreed with its Vigilance State, or several flies' together. */
export interface Disagreement {
  readonly scoredSleepMinutesPerDay: number;
  readonly trueSleepMinutesPerDay: number;
  /** Awake Immobility that the assay scored as sleep. */
  readonly awakeScoredAsSleep: DisagreementMeasure;
  /** True sleep that the assay didn't score as sleep, as it was too short or broken by movement. */
  readonly sleepNotScored: DisagreementMeasure;
}

function total(intervals: readonly Interval[]): number {
  return intervals.reduce((sum, each) => sum + each.end - each.start, 0);
}

/** The parts of each interval that none of the others cover. Both lists are sorted and apart. */
function subtract(from: readonly Interval[], take: readonly Interval[]): Interval[] {
  const left: Interval[] = [];
  let next = 0;
  for (const interval of from) {
    let start = interval.start;
    while (next < take.length && (take[next]?.end ?? 0) <= start) next += 1;
    for (let index = next; index < take.length; index++) {
      const cut = take[index];
      if (!cut || cut.start >= interval.end) break;
      if (cut.start > start) left.push({ start, end: cut.start });
      start = Math.max(start, cut.end);
    }
    if (start < interval.end) left.push({ start, end: interval.end });
  }
  return left;
}

function overlaps(interval: Interval, others: readonly Interval[]): boolean {
  return others.some((other) => other.start < interval.end && other.end > interval.start);
}

function hourOfDay(seconds: number): number {
  return Math.floor((seconds % DAY_SECONDS) / HOUR_SECONDS);
}

function measure(
  disagreeing: readonly Interval[],
  bouts: readonly Interval[],
  against: number,
  days: number,
): DisagreementMeasure {
  const minutesByHour = Array<number>(24).fill(0);
  for (const interval of disagreeing) {
    // Split at every hour it crosses.
    let start = interval.start;
    while (start < interval.end) {
      const end = Math.min(interval.end, (Math.floor(start / HOUR_SECONDS) + 1) * HOUR_SECONDS);
      const hour = hourOfDay(start);
      minutesByHour[hour] = (minutesByHour[hour] ?? 0) + (end - start) / 60;
      start = end;
    }
  }
  const boutsByHour = Array<number>(24).fill(0);
  for (const bout of bouts) {
    const hour = hourOfDay(bout.start);
    boutsByHour[hour] = (boutsByHour[hour] ?? 0) + 1;
  }
  const seconds = total(disagreeing);
  return {
    share: against > 0 ? seconds / against : null,
    minutesPerDay: seconds / 60 / days,
    boutsPerDay: bouts.length / days,
    minutesByHour: minutesByHour.map((each) => each / days),
    boutsByHour: boutsByHour.map((each) => each / days),
  };
}

/** Where one fly's Scored Sleep and its true Vigilance State disagreed, in each direction. */
export function disagreementOf(
  scored: ScoredActivity,
  vigilance: VigilanceRecord,
  rule: Pick<ScoringRule, "sleepThresholdMinutes">,
): Disagreement {
  const days = scored.durationSeconds / DAY_SECONDS;
  const scoredSleep = scored.scoredSleep.map((bout) => ({
    start: bout.startSeconds,
    end: bout.startSeconds + bout.durationSeconds,
  }));
  const trueSleep = vigilance.sleep.map((bout) => ({
    start: bout.startSeconds,
    end: bout.startSeconds + bout.durationSeconds,
  }));
  const awakeScored = subtract(scoredSleep, trueSleep);
  const sleepNotScored = subtract(trueSleep, scoredSleep);
  const [scoredSeconds, sleepSeconds] = [total(scoredSleep), total(trueSleep)];
  return {
    scoredSleepMinutesPerDay: scoredSeconds / 60 / days,
    trueSleepMinutesPerDay: sleepSeconds / 60 / days,
    awakeScoredAsSleep: measure(
      awakeScored,
      awakeScored.filter((each) => each.end - each.start >= rule.sleepThresholdMinutes * 60),
      scoredSeconds,
      days,
    ),
    sleepNotScored: measure(
      sleepNotScored,
      trueSleep.filter((bout) => !overlaps(bout, scoredSleep)),
      sleepSeconds,
      days,
    ),
  };
}

function meanOf(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, each) => sum + each, 0) / values.length;
}

function meanByHour(lists: readonly (readonly number[])[]): number[] {
  return Array.from({ length: 24 }, (_, hour) => meanOf(lists.map((list) => list[hour] ?? 0)));
}

/**
 * Several flies' disagreement together: shares of all their time pooled, and the rest averaged
 * per fly, as each fly's record lasts as long.
 */
export function poolDisagreement(flies: readonly Disagreement[]): Disagreement {
  const scored = meanOf(flies.map((fly) => fly.scoredSleepMinutesPerDay));
  const sleep = meanOf(flies.map((fly) => fly.trueSleepMinutesPerDay));
  const pool = (
    direction: "awakeScoredAsSleep" | "sleepNotScored",
    against: number,
  ): DisagreementMeasure => {
    const minutesPerDay = meanOf(flies.map((fly) => fly[direction].minutesPerDay));
    return {
      share: against > 0 ? minutesPerDay / against : null,
      minutesPerDay,
      boutsPerDay: meanOf(flies.map((fly) => fly[direction].boutsPerDay)),
      minutesByHour: meanByHour(flies.map((fly) => fly[direction].minutesByHour)),
      boutsByHour: meanByHour(flies.map((fly) => fly[direction].boutsByHour)),
    };
  };
  return {
    scoredSleepMinutesPerDay: scored,
    trueSleepMinutesPerDay: sleep,
    awakeScoredAsSleep: pool("awakeScoredAsSleep", scored),
    sleepNotScored: pool("sleepNotScored", sleep),
  };
}
