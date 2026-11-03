/**
 * Scoring turns what an assay observed into Inactivity Bouts, Activity Bouts and Scored Sleep. It
 * sees only the observation, never the Run Record, so it can't use the Vigilance State or anything
 * else a lab couldn't see.
 */

/** A run of consecutive bins that were all inactive, or all active. */
export interface Bout {
  /** Simulated seconds from the start of the run. */
  readonly startSeconds: number;
  readonly durationSeconds: number;
  /** Whether it was already going when the record started, so its true start is unknown. */
  readonly cutOffAtStart: boolean;
  /** Whether it was still going when the record ended, so its true end is unknown. */
  readonly cutOffAtEnd: boolean;
}

/** One fly's bouts, as an assay scores them. */
export interface ScoredActivity {
  readonly binSeconds: number;
  /** Simulated seconds from the start of the run to the start of the record. */
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly inactivityBouts: readonly Bout[];
  readonly activityBouts: readonly Bout[];
  /** The Inactivity Bouts at least as long as the sleep threshold. */
  readonly scoredSleep: readonly Bout[];
}

/**
 * Scores a record of which bins showed movement. A bout cut off by either end of the record is
 * kept and marked, as its length is only a lower bound.
 */
export function scoreActivity(
  active: readonly boolean[],
  binSeconds: number,
  startSeconds: number,
  sleepThresholdMinutes: number,
): ScoredActivity {
  const inactivityBouts: Bout[] = [];
  const activityBouts: Bout[] = [];
  let first = 0;
  for (let bin = 1; bin <= active.length; bin++) {
    if (bin < active.length && active[bin] === active[first]) continue;
    const bout: Bout = {
      startSeconds: startSeconds + first * binSeconds,
      durationSeconds: (bin - first) * binSeconds,
      cutOffAtStart: first === 0,
      cutOffAtEnd: bin === active.length,
    };
    (active[first] ? activityBouts : inactivityBouts).push(bout);
    first = bin;
  }
  return {
    binSeconds,
    startSeconds,
    durationSeconds: active.length * binSeconds,
    inactivityBouts,
    activityBouts,
    scoredSleep: inactivityBouts.filter(
      (bout) => bout.durationSeconds >= sleepThresholdMinutes * 60,
    ),
  };
}

/** Every fly's bouts together, in fly order, as a study pools its flies. */
export function poolBouts(
  flies: readonly ScoredActivity[],
): Pick<ScoredActivity, "inactivityBouts" | "activityBouts" | "scoredSleep"> {
  return {
    inactivityBouts: flies.flatMap((fly) => fly.inactivityBouts),
    activityBouts: flies.flatMap((fly) => fly.activityBouts),
    scoredSleep: flies.flatMap((fly) => fly.scoredSleep),
  };
}
