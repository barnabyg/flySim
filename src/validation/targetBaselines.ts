import {
  BASELINE_FORM,
  CURVE_METHOD,
  DURATIONS_METHOD,
  baselineCurve,
  baselineSurvival,
  curveDistance,
  empiricalSurvival,
  fitBaselineToCurve,
  fitBaselineToDurations,
  type BaselineParameters,
} from "./baseline";
import type { BoutKind, SurvivalCurve } from "./boutShapes";
import type { ValidationTarget } from "./evidencePack";
import { completeDurations, inPhase, type DayContext } from "./measures";
import type { ScoredActivity } from "./scoring";
import { comparisonsOf, numberParameter, type Comparison } from "./targets";

/** The descriptive baseline for one bout-duration comparison, beside the model's bouts. */
export interface BoutBaseline {
  /** The comparison's id, as its result has in the report. */
  readonly id: string;
  readonly targetId: string;
  readonly title: string;
  readonly heldOut: boolean;
  readonly bouts: BoutKind;
  readonly form: string;
  readonly method: string;
  /** What the baseline was fitted to: the published data, or the published fit. */
  readonly fittedTo: string;
  readonly xminSeconds: number;
  readonly xmaxSeconds: number;
  readonly fitted: BaselineParameters;
  /** The same form fitted to the model's bouts, for comparison, or null with too few. */
  readonly modelFit: BaselineParameters | null;
  readonly modelFitMethod: string;
  readonly published: SurvivalCurve;
  readonly baseline: SurvivalCurve;
  readonly model: SurvivalCurve;
  /**
   * How far the model's pooled bouts and the published data are from the baseline over the
   * published range: the largest gap in the share of bouts lasting at least each duration.
   */
  readonly distance: { readonly model: number | null; readonly published: number };
}

const POINTS = 50;

const round = (value: number): number => Number(value.toPrecision(3));

/** Rounded off below what any reading of a chart needs, so float noise reads as 0. */
const tidy = (value: number): number => Math.round(value * 1e9) / 1e9;

function tidyParameters({ beta, tauSeconds }: BaselineParameters): BaselineParameters {
  return { beta: tidy(beta), tauSeconds: tauSeconds === null ? null : tidy(tauSeconds) };
}

/** The published fit as a survival curve, from what the target's criterion says it is. */
function publishedFit(
  comparison: Comparison,
): { parameters: BaselineParameters; description: string } | null {
  const { criterion } = comparison;
  const [first] = comparison.published;
  if (typeof first?.value !== "number") return null;
  const where = `${first.label}, ${first.location}`;
  if (criterion.kind === "exponent-within") {
    // A density's exponent is one more than its survival's.
    const beta = criterion["exponentForm"] === "pdf" ? first.value - 1 : first.value;
    return {
      parameters: { beta, tauSeconds: null },
      description: `The published fit, as the source gives only that: a power law with survival exponent ${round(beta)} (${where}).`,
    };
  }
  if (criterion.kind === "exponential-rate-within") {
    return {
      parameters: { beta: 0, tauSeconds: 1 / first.value },
      description: `The published fit, as the source gives only that: an exponential tail with rate ${round(first.value)} per second (${where}).`,
    };
  }
  return null;
}

const KINDS: Readonly<Record<string, BoutKind>> = {
  "inactivity-bout-duration-distribution": "inactivity",
  "activity-bout-duration-distribution": "activity",
};

/**
 * The descriptive baseline for each comparison of a bout-duration target, fitted to its published
 * fit, with how far it is from the model's pooled bouts and from the published data.
 */
export function targetBaselines(
  target: ValidationTarget,
  flies: readonly { readonly scored: ScoredActivity }[],
  context: DayContext,
  binSeconds: number,
): BoutBaseline[] {
  const bouts = KINDS[target.measure];
  if (!bouts) return [];
  return comparisonsOf(target).flatMap((comparison) => {
    const fit = publishedFit(comparison);
    if (!fit) return [];
    const xmin = numberParameter(comparison.criterion, "xminSeconds");
    const xmax = numberParameter(comparison.criterion, "xmaxSeconds");
    const published = baselineCurve(fit.parameters, xmin, xmax, POINTS);
    const fitted = tidyParameters(fitBaselineToCurve(published, xmin));
    const durations = flies.flatMap((fly) =>
      completeDurations(
        fly.scored[bouts === "inactivity" ? "inactivityBouts" : "activityBouts"].filter((bout) =>
          inPhase(bout.startSeconds, comparison.phase, context),
        ),
      ),
    );
    const model = empiricalSurvival(durations, xmin);
    const hasModel = durations.some((each) => each >= xmin);
    const fittedSurvival = baselineSurvival(fitted, xmin);
    const baseline = baselineCurve(fitted, xmin, xmax, POINTS);
    return [
      {
        id: comparison.id,
        targetId: target.id,
        title: comparison.title,
        heldOut: target.heldOut,
        bouts,
        form: BASELINE_FORM,
        method: CURVE_METHOD,
        fittedTo: fit.description,
        xminSeconds: xmin,
        xmaxSeconds: xmax,
        fitted,
        modelFit: fitBaselineToDurations(durations, { xminSeconds: xmin, binSeconds }),
        modelFitMethod: DURATIONS_METHOD,
        published,
        baseline,
        model: {
          durations: baseline.durations,
          survival: hasModel ? baseline.durations.map(model) : [],
        },
        distance: {
          model: hasModel ? tidy(curveDistance(model, fittedSurvival, xmin, xmax)) : null,
          published: tidy(
            curveDistance(baselineSurvival(fit.parameters, xmin), fittedSurvival, xmin, xmax),
          ),
        },
      },
    ];
  });
}
