/**
 * Scoring turns what an instrument observed into Inactivity Bouts, Activity Bouts and Scored
 * Sleep. It sees only the observation, never the Run Record, so it can't use the Vigilance State
 * or anything else a lab couldn't see.
 */
import type { Observation } from "./instruments";

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

/** How a study scores its record. */
export interface ScoringRule {
  /** An Inactivity Bout at least this long is Scored Sleep. */
  readonly sleepThresholdMinutes: number;
  /**
   * A stillness shorter than this isn't an Inactivity Bout, and counts as part of the activity
   * around it, as when a method needs a fly to stay put for a while before it is resting.
   */
  readonly minInactivitySeconds?: number;
}

/** Runs of bins that were all active or all inactive, with how many bins each lasts. */
type Runs = readonly (readonly [active: boolean, bins: number])[];

function runsOf(active: readonly boolean[]): Runs {
  const runs: [boolean, number][] = [];
  for (const each of active) {
    const last = runs.at(-1);
    if (last?.[0] === each) last[1] += 1;
    else runs.push([each, 1]);
  }
  return runs;
}

/** Treats inactive runs shorter than the shortest Inactivity Bout as activity, and joins them up. */
function withoutShortStillness(runs: Runs, binSeconds: number, minSeconds: number): Runs {
  const joined: [boolean, number][] = [];
  for (const [active, bins] of runs) {
    const counted = active || bins * binSeconds < minSeconds;
    const last = joined.at(-1);
    if (last?.[0] === counted) last[1] += bins;
    else joined.push([counted, bins]);
  }
  return joined;
}

function scoreRuns(
  given: Runs,
  binSeconds: number,
  startSeconds: number,
  rule: ScoringRule,
): ScoredActivity {
  const runs = rule.minInactivitySeconds
    ? withoutShortStillness(given, binSeconds, rule.minInactivitySeconds)
    : given;
  const inactivityBouts: Bout[] = [];
  const activityBouts: Bout[] = [];
  let bin = 0;
  runs.forEach(([active, bins], index) => {
    const bout: Bout = {
      startSeconds: startSeconds + bin * binSeconds,
      durationSeconds: bins * binSeconds,
      cutOffAtStart: index === 0,
      cutOffAtEnd: index === runs.length - 1,
    };
    (active ? activityBouts : inactivityBouts).push(bout);
    bin += bins;
  });
  return {
    binSeconds,
    startSeconds,
    durationSeconds: bin * binSeconds,
    inactivityBouts,
    activityBouts,
    scoredSleep: inactivityBouts.filter(
      (bout) => bout.durationSeconds >= rule.sleepThresholdMinutes * 60,
    ),
  };
}

/**
 * Scores a record of which bins showed movement. A bout cut off by either end of the record is
 * kept and marked, as its length is only a lower bound.
 */
export function scoreActivity(
  active: readonly boolean[],
  binSeconds: number,
  startSeconds: number,
  rule: ScoringRule,
): ScoredActivity {
  return scoreRuns(runsOf(active), binSeconds, startSeconds, rule);
}

/** Which bins of a beam monitor's record showed movement: any beam crossing at all. */
export function activeBins(counts: readonly number[]): boolean[] {
  return counts.map((count) => count > 0);
}

/** Scores what an instrument recorded, and nothing else. */
export function scoreObservation(observation: Observation, rule: ScoringRule): ScoredActivity {
  return observation.kind === "beam-crossing"
    ? scoreActivity(
        activeBins(observation.counts),
        observation.binSeconds,
        observation.startSeconds,
        rule,
      )
    : scoreRuns(observation.runs, observation.windowSeconds, observation.startSeconds, rule);
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
