import { UnsupportedTargetError } from "./assays";
import type { TargetCriterion, ValidationTarget } from "./evidencePack";
import type { Observation } from "./instruments";
import {
  coefficientOfVariation,
  completeDurations,
  exponentialTailRate,
  inPhase,
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
import type { FlyValue, PublishedValue, TargetDisplay, TargetResult } from "./report";
import { poolBouts, type Bout, type ScoredActivity } from "./scoring";

/** One simulated fly as an assay saw and scored it. */
export interface AssayedFly {
  readonly seed: number;
  readonly observation: Observation;
  readonly scored: ScoredActivity;
}

/** A measure's value for each fly and for the flies together. */
interface Measured {
  readonly perFly: readonly FlyValue[];
  /** As the criterion combines the flies: pooled, or the mean of each fly's value. */
  readonly pooled: MeasureValue;
}

/**
 * One comparison a target asks for. Most targets have one, but some ask for the same comparison
 * in the light and the dark separately, with their own bounds.
 */
export interface Comparison {
  readonly id: string;
  readonly title: string;
  readonly phase: Phase;
  readonly criterion: TargetCriterion;
  readonly published: readonly PublishedValue[];
}

export function numberParameter(criterion: TargetCriterion, name: string): number {
  const value = criterion[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new UnsupportedTargetError(`Its criterion has no number ${name}`);
  }
  return value;
}

function isPhase(value: unknown): value is Phase {
  return value === "light" || value === "dark" || value === "day";
}

/** A target's comparisons: one per phase when its criterion lists phases, or else just one. */
export function comparisonsOf(target: ValidationTarget): Comparison[] {
  const { phases, ...shared } = target.criterion;
  if (!Array.isArray(phases)) {
    const phase = target.criterion["phase"];
    return [
      {
        id: target.id,
        title: target.title,
        phase: isPhase(phase) ? phase : "day",
        criterion: target.criterion,
        published: target.published,
      },
    ];
  }
  return (phases as readonly Record<string, unknown>[]).map((each) => {
    const phase = each["phase"];
    if (!isPhase(phase)) throw new UnsupportedTargetError("One of its phases isn't light or dark");
    const published = target.published.filter((value) => value.label.toLowerCase().includes(phase));
    return {
      id: `${target.id}:${phase}`,
      title: `${target.title} (${phase === "light" ? "in the light" : "in the dark"})`,
      phase,
      criterion: { ...shared, ...each },
      published: published.length > 0 ? published : target.published,
    };
  });
}

function startsIn(phase: Phase, context: DayContext): (bout: Bout) => boolean {
  return (bout) => inPhase(bout.startSeconds, phase, context);
}

function scalarMeasure(
  flies: readonly AssayedFly[],
  of: (fly: ScoredActivity) => number | null,
): Measured {
  const perFly = flies.map((fly) => ({ seed: fly.seed, value: of(fly.scored) }));
  return { perFly, pooled: mean(perFly.map((each) => each.value)) };
}

/**
 * A bout shape's statistic for each fly, and for the flies together: on their bouts pooled, or as
 * the mean of each fly's own, as the criterion says.
 */
function boutShape(
  flies: readonly AssayedFly[],
  bouts: "inactivityBouts" | "activityBouts",
  comparison: Comparison,
  context: DayContext,
): Measured {
  const { criterion } = comparison;
  let statistic: (durations: readonly number[]) => number | null;
  switch (criterion.kind) {
    case "exponent-within": {
      const xmin = numberParameter(criterion, "xminSeconds");
      const xmax = numberParameter(criterion, "xmaxSeconds");
      // The CCDF's exponent is one less than the density's.
      const shift = criterion["exponentForm"] === "ccdf" ? 1 : 0;
      statistic = (durations) => {
        const alpha = powerLawExponent(durations, xmin, xmax);
        return alpha === null ? null : alpha - shift;
      };
      break;
    }
    case "exponential-rate-within": {
      const xmin = numberParameter(criterion, "xminSeconds");
      const xmax = numberParameter(criterion, "xmaxSeconds");
      statistic = (durations) => exponentialTailRate(durations, xmin, xmax);
      break;
    }
    case "coefficient-of-variation-within":
      statistic = coefficientOfVariation;
      break;
    default:
      throw new UnsupportedTargetError(`A bout shape can't be judged by ${criterion.kind}`);
  }
  const inPhase = startsIn(comparison.phase, context);
  const durationsOf = (scored: Pick<ScoredActivity, typeof bouts>) =>
    completeDurations(scored[bouts].filter(inPhase));
  const perFly = flies.map((fly) => ({
    seed: fly.seed,
    value: statistic(durationsOf(fly.scored)),
  }));
  const aggregate = criterion["aggregate"];
  const pooled =
    typeof aggregate === "string" && aggregate.startsWith("mean")
      ? mean(perFly.map((each) => each.value))
      : statistic(durationsOf(poolBouts(flies.map((fly) => fly.scored))));
  return { perFly, pooled };
}

function profileBinMinutes(comparison: Comparison): number {
  const [first] = comparison.published;
  const bins = Array.isArray(first?.value) ? first.value.length : 0;
  if (bins === 0 || (24 * 60) % bins !== 0) {
    throw new UnsupportedTargetError("Its published profile doesn't divide the day into bins");
  }
  return (24 * 60) / bins;
}

/** Works out a comparison's measure for every fly, as its study defines it. */
function measure(
  target: ValidationTarget,
  comparison: Comparison,
  flies: readonly AssayedFly[],
  context: DayContext,
): Measured {
  const { phase } = comparison;
  switch (target.measure) {
    case "daily-scored-sleep-minutes":
      return scalarMeasure(flies, (fly) => scoredSleepMinutesPerDay(fly, "day", context));
    case "light-phase-scored-sleep-minutes":
      return scalarMeasure(flies, (fly) => scoredSleepMinutesPerDay(fly, "light", context));
    case "dark-phase-scored-sleep-minutes":
      return scalarMeasure(flies, (fly) => scoredSleepMinutesPerDay(fly, "dark", context));
    case "sleep-bout-count":
      return scalarMeasure(flies, (fly) => sleepBoutsPerDay(fly, phase, context));
    case "mean-sleep-bout-minutes":
      return scalarMeasure(flies, (fly) => meanSleepBoutMinutes(fly, phase, context));
    case "scored-sleep-profile": {
      const binMinutes = profileBinMinutes(comparison);
      const perFly = flies.map((fly) => ({
        seed: fly.seed,
        value: scoredSleepProfile(fly.scored, binMinutes),
      }));
      return { perFly, pooled: meanProfile(perFly.map((each) => each.value)) };
    }
    case "inactivity-bout-duration-distribution":
      return boutShape(flies, "inactivityBouts", comparison, context);
    case "activity-bout-duration-distribution":
      return boutShape(flies, "activityBouts", comparison, context);
    default:
      throw new UnsupportedTargetError(`The suite can't measure ${target.measure} yet`);
  }
}

const format = (value: number): string => String(Math.round(value * 1000) / 1000);

/** Whether the model meets a comparison's criterion, and how the comparison is drawn. */
function judge(
  comparison: Comparison,
  pooled: MeasureValue,
): { result: TargetResult["result"]; display: TargetDisplay } {
  const { criterion } = comparison;
  switch (criterion.kind) {
    case "within-interval":
    case "exponent-within":
    case "exponential-rate-within":
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
          description: `The model's ${format(pooled)} is ${pass ? "within" : "outside"} ${format(low)} to ${format(high)}.`,
        },
      };
    }
    case "profile-correlation":
      return judgeProfile(comparison, pooled);
    default:
      throw new UnsupportedTargetError(`The suite can't judge a ${criterion.kind} criterion yet`);
  }
}

function judgeProfile(
  comparison: Comparison,
  pooled: MeasureValue,
): { result: TargetResult["result"]; display: TargetDisplay } {
  const { criterion } = comparison;
  const minR = numberParameter(criterion, "minR");
  const published = comparison.published[0]?.value;
  if (!Array.isArray(published)) throw new UnsupportedTargetError("It has no published profile");
  const binMinutes = (24 * 60) / published.length;
  const display: TargetDisplay = {
    kind: "profile",
    binLabels: published.map((_, bin) => `ZT${format((bin * binMinutes) / 60)}`),
  };
  if (!Array.isArray(pooled)) {
    return { display, result: { pass: false, statistic: null, description: "No model profile." } };
  }
  const r = pearson(pooled, published);
  const differences = pooled.map((value, bin) => Math.abs(value - (published[bin] ?? 0)));
  const meanDifference = differences.reduce((sum, each) => sum + each, 0) / differences.length;
  const maxMean = criterion["maxMeanAbsoluteDifferenceMinutes"];
  const tolerance = criterion["toleranceMinutes"];
  const outside =
    typeof tolerance === "number" ? differences.filter((each) => each > tolerance).length : 0;
  const parts = [
    r === null ? "the model's profile is flat" : `r = ${format(r)} (at least ${format(minR)})`,
  ];
  let pass = r !== null && r >= minR;
  if (typeof maxMean === "number") {
    parts.push(`mean difference ${format(meanDifference)} min (at most ${format(maxMean)})`);
    pass &&= meanDifference <= maxMean;
  }
  if (typeof tolerance === "number") {
    parts.push(`${outside} bins more than ${format(tolerance)} min off`);
    pass &&= outside === 0;
  }
  const description = `${parts.join(", ")}.`;
  return {
    display,
    result: {
      pass,
      statistic: r,
      description: `${description.charAt(0).toUpperCase()}${description.slice(1)}`,
    },
  };
}

/** The model against a target, one result per comparison it asks for. */
export function evaluateTarget(
  target: ValidationTarget,
  flies: readonly AssayedFly[],
  context: DayContext,
): TargetResult[] {
  return comparisonsOf(target).map((comparison) => {
    const measured = measure(target, comparison, flies, context);
    const { result, display } = judge(comparison, measured.pooled);
    return {
      id: comparison.id,
      title: comparison.title,
      heldOut: target.heldOut,
      citation: target.source.citation,
      assay: target.assay.kind,
      measure: target.measure,
      unit: comparison.published[0]?.unit ?? "",
      published: comparison.published,
      model: measured,
      criterion: { kind: comparison.criterion.kind, description: target.criterion.description },
      display,
      result,
    };
  });
}
