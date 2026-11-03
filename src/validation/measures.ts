import type { Bout, ScoredActivity } from "./scoring";

const DAY_SECONDS = 86_400;

/** When the lights are on, from the run's start at lights-on. */
export interface DayContext {
  readonly lightHours: number;
}

/** Which part of the day a measure covers. */
export type Phase = "light" | "dark" | "day";

/** What a measure gives for one fly, or for every fly pooled. */
export type MeasureValue = number | readonly number[] | null;

function inPhase(seconds: number, phase: Phase, context: DayContext): boolean {
  if (phase === "day") return true;
  const light = seconds % DAY_SECONDS < context.lightHours * 3600;
  return phase === "light" ? light : !light;
}

/** Each bin of the record, with whether it was Scored Sleep. */
function sleepByBin(fly: ScoredActivity): boolean[] {
  const bins = Math.round(fly.durationSeconds / fly.binSeconds);
  const asleep = Array<boolean>(bins).fill(false);
  for (const bout of fly.scoredSleep) {
    const first = Math.round((bout.startSeconds - fly.startSeconds) / fly.binSeconds);
    const count = Math.round(bout.durationSeconds / fly.binSeconds);
    asleep.fill(true, first, first + count);
  }
  return asleep;
}

function recordedDays(fly: ScoredActivity): number {
  return fly.durationSeconds / DAY_SECONDS;
}

/** Minutes of Scored Sleep per day in a phase, averaged over the recorded days. */
export function scoredSleepMinutesPerDay(
  fly: ScoredActivity,
  phase: Phase,
  context: DayContext,
): number {
  let bins = 0;
  sleepByBin(fly).forEach((asleep, bin) => {
    if (asleep && inPhase(fly.startSeconds + bin * fly.binSeconds, phase, context)) bins += 1;
  });
  return (bins * fly.binSeconds) / 60 / recordedDays(fly);
}

/** Minutes of Scored Sleep in each part of the day, from lights-on, averaged over the days. */
export function scoredSleepProfile(fly: ScoredActivity, binMinutes: number): number[] {
  const perDay = Math.round((24 * 60) / binMinutes);
  const minutes = Array<number>(perDay).fill(0);
  sleepByBin(fly).forEach((asleep, bin) => {
    if (!asleep) return;
    const timeOfDay = (fly.startSeconds + bin * fly.binSeconds) % DAY_SECONDS;
    const part = Math.floor(timeOfDay / (binMinutes * 60));
    minutes[part] = (minutes[part] ?? 0) + fly.binSeconds / 60;
  });
  return minutes.map((each) => each / recordedDays(fly));
}

/** The Scored Sleep bouts that start in a phase. */
function sleepBoutsIn(fly: ScoredActivity, phase: Phase, context: DayContext): readonly Bout[] {
  return fly.scoredSleep.filter((bout) => inPhase(bout.startSeconds, phase, context));
}

/** Scored Sleep bouts starting in a phase, per day. */
export function sleepBoutsPerDay(fly: ScoredActivity, phase: Phase, context: DayContext): number {
  return sleepBoutsIn(fly, phase, context).length / recordedDays(fly);
}

/** The mean length of Scored Sleep bouts starting in a phase, or null if there were none. */
export function meanSleepBoutMinutes(
  fly: ScoredActivity,
  phase: Phase,
  context: DayContext,
): number | null {
  const bouts = sleepBoutsIn(fly, phase, context);
  if (bouts.length === 0) return null;
  return bouts.reduce((sum, bout) => sum + bout.durationSeconds, 0) / 60 / bouts.length;
}

/** Bout lengths in seconds, leaving out those cut off by the record's ends. */
export function completeDurations(bouts: readonly Bout[]): number[] {
  return bouts
    .filter((bout) => !bout.cutOffAtStart && !bout.cutOffAtEnd)
    .map((bout) => bout.durationSeconds);
}

/**
 * The coefficient of variation: 1 for an exponential distribution, more for a heavier tail. Null
 * for fewer than two values.
 */
export function coefficientOfVariation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, each) => sum + each, 0) / values.length;
  const variance =
    values.reduce((sum, each) => sum + (each - mean) * (each - mean), 0) / (values.length - 1);
  return mean > 0 ? Math.sqrt(variance) / mean : null;
}

/**
 * The maximum-likelihood exponent of a power law p(x) ∝ x^-α between xmin and xmax, from the
 * values in that range. Null for fewer than ten values.
 */
export function powerLawExponent(
  values: readonly number[],
  xmin: number,
  xmax: number,
): number | null {
  const inRange = values.filter((each) => each >= xmin && each <= xmax);
  if (inRange.length < 10) return null;
  const sumLog = inRange.reduce((sum, each) => sum + Math.log(each), 0);
  const n = inRange.length;
  const logLikelihood = (alpha: number): number =>
    n * Math.log((alpha - 1) / (xmin ** (1 - alpha) - xmax ** (1 - alpha))) - alpha * sumLog;
  // The likelihood has one peak, which a golden-section search finds.
  let [low, high] = [1.0001, 6];
  const golden = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 100; i++) {
    const a = high - golden * (high - low);
    const b = low + golden * (high - low);
    if (logLikelihood(a) < logLikelihood(b)) low = a;
    else high = b;
  }
  return (low + high) / 2;
}

export function mean(values: readonly (number | null)[]): number | null {
  const present = values.filter((each): each is number => each !== null);
  return present.length === 0
    ? null
    : present.reduce((sum, each) => sum + each, 0) / present.length;
}

/** The mean of each bin across profiles. */
export function meanProfile(profiles: readonly (readonly number[])[]): number[] | null {
  const [first] = profiles;
  if (!first) return null;
  return first.map((_, bin) => mean(profiles.map((profile) => profile[bin] ?? null)) ?? 0);
}

export function pearson(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const meanA = a.reduce((sum, each) => sum + each, 0) / a.length;
  const meanB = b.reduce((sum, each) => sum + each, 0) / b.length;
  let [covariance, varianceA, varianceB] = [0, 0, 0];
  a.forEach((each, index) => {
    const [da, db] = [each - meanA, (b[index] ?? 0) - meanB];
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  });
  return varianceA > 0 && varianceB > 0 ? covariance / Math.sqrt(varianceA * varianceB) : null;
}

/**
 * The rate of an exponential tail: minus the least-squares slope of the log of the CCDF, the share
 * of lengths at least t, at each whole second t from xmin to xmax. Null if too few seconds have
 * any lengths to fit.
 */
export function exponentialTailRate(
  values: readonly number[],
  xmin: number,
  xmax: number,
): number | null {
  if (values.length === 0) return null;
  const points: [number, number][] = [];
  for (let t = Math.ceil(xmin); t <= xmax; t++) {
    const share = values.filter((each) => each >= t).length / values.length;
    if (share > 0) points.push([t, Math.log(share)]);
  }
  if (points.length < 3) return null;
  const meanT = points.reduce((sum, [t]) => sum + t, 0) / points.length;
  const meanLog = points.reduce((sum, [, log]) => sum + log, 0) / points.length;
  let [covariance, variance] = [0, 0];
  for (const [t, log] of points) {
    covariance += (t - meanT) * (log - meanLog);
    variance += (t - meanT) * (t - meanT);
  }
  return -covariance / variance;
}
