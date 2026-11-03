import type { BeamObservation } from "./beamMonitor";
import type { TargetCriterion, ValidationTarget } from "./evidencePack";
import {
  coefficientOfVariation,
  completeDurations,
  mean,
  meanProfile,
  meanSleepBoutMinutes,
  pearson,
  powerLawExponent,
  scoredSleepMinutesPerDay,
  scoredSleepProfile,
  sleepBoutsPerDay,
  type DayContext,
  type MeasureValue,
  type Phase,
} from "./measures";
import type { FlyValue, TargetDisplay, TargetResult } from "./report";
import { poolBouts, type ScoredActivity } from "./scoring";

/** One simulated fly as an assay saw and scored it. */
export interface AssayedFly {
  readonly seed: number;
  readonly observation: BeamObservation;
  readonly scored: ScoredActivity;
}

/** A measure's value for each fly and for every fly pooled. */
interface Measured {
  readonly perFly: readonly FlyValue[];
  readonly pooled: MeasureValue;
}

/** Thrown for a target the validation suite has no way to measure or judge yet. */
export class UnsupportedTargetError extends Error {
  override readonly name = "UnsupportedTargetError";
}

function numberParameter(criterion: TargetCriterion, name: string): number {
  const value = criterion[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new UnsupportedTargetError(`Its criterion has no number ${name}`);
  }
  return value;
}

function phaseOf(target: ValidationTarget): Phase {
  const phase = target.criterion["phase"];
  if (phase === "light" || phase === "dark" || phase === "day") return phase;
  return "day";
}

function scalarMeasure(
  flies: readonly AssayedFly[],
  of: (fly: ScoredActivity) => number | null,
): Measured {
  const perFly = flies.map((fly) => ({ seed: fly.seed, value: of(fly.scored) }));
  return { perFly, pooled: mean(perFly.map((each) => each.value)) };
}

/** A bout shape's statistic per fly, and over every fly's bouts pooled. */
function boutShape(
  flies: readonly AssayedFly[],
  bouts: "inactivityBouts" | "activityBouts",
  criterion: TargetCriterion,
): Measured {
  let statistic: (durations: readonly number[]) => number | null;
  switch (criterion.kind) {
    case "exponent-within": {
      const xmin = numberParameter(criterion, "xminSeconds");
      const xmax = numberParameter(criterion, "xmaxSeconds");
      statistic = (durations) => powerLawExponent(durations, xmin, xmax);
      break;
    }
    case "coefficient-of-variation-within":
      statistic = coefficientOfVariation;
      break;
    default:
      throw new UnsupportedTargetError(`A bout shape can't be judged by ${criterion.kind}`);
  }
  return {
    perFly: flies.map((fly) => ({
      seed: fly.seed,
      value: statistic(completeDurations(fly.scored[bouts])),
    })),
    pooled: statistic(completeDurations(poolBouts(flies.map((fly) => fly.scored))[bouts])),
  };
}

function profileBinMinutes(target: ValidationTarget): number {
  const [first] = target.published;
  const bins = Array.isArray(first?.value) ? first.value.length : 0;
  if (bins === 0 || (24 * 60) % bins !== 0) {
    throw new UnsupportedTargetError("Its published profile doesn't divide the day into bins");
  }
  return (24 * 60) / bins;
}

/** Works out a target's measure for every fly, as its study defines it. */
export function measureTarget(
  target: ValidationTarget,
  flies: readonly AssayedFly[],
  context: DayContext,
): Measured {
  switch (target.measure) {
    case "daily-scored-sleep-minutes":
      return scalarMeasure(flies, (fly) => scoredSleepMinutesPerDay(fly, "day", context));
    case "light-phase-scored-sleep-minutes":
      return scalarMeasure(flies, (fly) => scoredSleepMinutesPerDay(fly, "light", context));
    case "dark-phase-scored-sleep-minutes":
      return scalarMeasure(flies, (fly) => scoredSleepMinutesPerDay(fly, "dark", context));
    case "sleep-bout-count":
      return scalarMeasure(flies, (fly) => sleepBoutsPerDay(fly, phaseOf(target), context));
    case "mean-sleep-bout-minutes":
      return scalarMeasure(flies, (fly) => meanSleepBoutMinutes(fly, phaseOf(target), context));
    case "daily-activity-counts": {
      const perFly = flies.map(({ seed, observation }) => ({
        seed,
        value:
          (observation.counts.reduce((sum, count) => sum + count, 0) * 86_400) /
          (observation.counts.length * observation.binSeconds),
      }));
      return { perFly, pooled: mean(perFly.map((each) => each.value)) };
    }
    case "scored-sleep-profile": {
      const binMinutes = profileBinMinutes(target);
      const perFly = flies.map((fly) => ({
        seed: fly.seed,
        value: scoredSleepProfile(fly.scored, binMinutes),
      }));
      return { perFly, pooled: meanProfile(perFly.map((each) => each.value)) };
    }
    case "inactivity-bout-duration-distribution":
      return boutShape(flies, "inactivityBouts", target.criterion);
    case "activity-bout-duration-distribution":
      return boutShape(flies, "activityBouts", target.criterion);
    default:
      throw new UnsupportedTargetError(`The suite can't measure ${target.measure} yet`);
  }
}

const format = (value: number): string => String(Math.round(value * 100) / 100);

/** Whether the pooled model meets the target's criterion, and how the comparison is drawn. */
export function judge(
  target: ValidationTarget,
  pooled: MeasureValue,
): { result: TargetResult["result"]; display: TargetDisplay } {
  const { criterion } = target;
  switch (criterion.kind) {
    case "within-interval":
    case "exponent-within":
    case "coefficient-of-variation-within": {
      const low = numberParameter(criterion, "low");
      const high = numberParameter(criterion, "high");
      const display: TargetDisplay = { kind: "scalar", accepted: { low, high } };
      if (typeof pooled !== "number") {
        return {
          display,
          result: { pass: false, statistic: null, description: "The model gave no value." },
        };
      }
      const pass = pooled >= low && pooled <= high;
      return {
        display,
        result: {
          pass,
          statistic: pooled,
          description: `The pooled model value ${format(pooled)} is ${pass ? "within" : "outside"} ${format(low)} to ${format(high)}.`,
        },
      };
    }
    case "profile-correlation": {
      const minR = numberParameter(criterion, "minR");
      const published = target.published[0]?.value;
      if (!Array.isArray(published))
        throw new UnsupportedTargetError("It has no published profile");
      const bins = published.length;
      const binMinutes = (24 * 60) / bins;
      const display: TargetDisplay = {
        kind: "profile",
        binLabels: Array.from({ length: bins }, (_, bin) => `ZT${format((bin * binMinutes) / 60)}`),
      };
      const r = Array.isArray(pooled) ? pearson(pooled, published) : null;
      const tolerance = criterion["tolerance"];
      const outside =
        typeof tolerance === "number" && Array.isArray(pooled)
          ? pooled.filter((value, bin) => Math.abs(value - (published[bin] ?? 0)) > tolerance)
              .length
          : 0;
      const pass = r !== null && r >= minR && outside === 0;
      const description =
        r === null
          ? "The model's profile is flat, so it has no correlation."
          : `r = ${format(r)}, ${r >= minR ? "at least" : "below"} ${format(minR)}` +
            (typeof tolerance === "number"
              ? `, with ${outside} bin${outside === 1 ? "" : "s"} more than ${format(tolerance)} from the published value.`
              : ".");
      return { display, result: { pass, statistic: r, description } };
    }
    default:
      throw new UnsupportedTargetError(`The suite can't judge a ${criterion.kind} criterion yet`);
  }
}

/** The model against one target, from the flies its assay ran. */
export function evaluateTarget(
  target: ValidationTarget,
  flies: readonly AssayedFly[],
  context: DayContext,
): TargetResult {
  const measured = measureTarget(target, flies, context);
  const { result, display } = judge(target, measured.pooled);
  return {
    id: target.id,
    title: target.title,
    heldOut: target.heldOut,
    citation: target.source.citation,
    assay: target.assay.kind,
    measure: target.measure,
    unit: target.published[0]?.unit ?? "",
    published: target.published,
    model: measured,
    criterion: { kind: target.criterion.kind, description: target.criterion.description },
    display,
    result,
  };
}
