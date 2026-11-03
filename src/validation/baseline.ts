/**
 * The fitted descriptive baseline of bout durations: an explicit time-in-bout model, a power law
 * with an exponential tail, whose hazard is β/t + 1/τ. It describes the published data rather than
 * explaining it, which is why ADR-0001 rejects it as a mechanism. It exists only to compare the
 * model's bouts with, and nothing in the engine uses it, which lint enforces.
 */
import { MIN_BOUTS, type FitOptions, type SurvivalCurve } from "./boutShapes";
import { groupDurations, groupedCount, logSpaced, maximise } from "./fitting";

/** The baseline's form and how it is fitted, as the report records them. */
export const BASELINE_FORM =
  "A power law with an exponential tail: the share of bouts lasting at least t, of those lasting at least xmin, is (t/xmin)^−β · e^−(t−xmin)/τ, so the chance of a bout ending falls with time in it as β/t + 1/τ.";

/** How the baseline is fitted to bout durations, such as the model's. */
export const DURATIONS_METHOD =
  "Maximum likelihood on the bout durations of at least xmin, each counted as the bin it was scored in.";

/** How the baseline is fitted to a published fit, where a source gives only that. */
export const CURVE_METHOD =
  "Least squares on the logarithm of the published fit's survival, at 50 durations spaced evenly on a log scale over its range.";

/** The baseline's parameters: the power law's exponent, and the tail's time constant. */
export interface BaselineParameters {
  readonly beta: number;
  /** In seconds, or null where there is no exponential tail. */
  readonly tauSeconds: number | null;
}

/** Below this rate there is no exponential tail to speak of. */
const NO_TAIL_RATE = 1e-7;

/** The tail as a rate, 1/τ, or 0 with no tail. */
function tailRate({ tauSeconds }: BaselineParameters): number {
  return tauSeconds === null ? 0 : 1 / tauSeconds;
}

/** The baseline's log survival from xmin, with the tail as a rate, 1/τ. */
function logSurvival(t: number, xmin: number, beta: number, rate: number): number {
  return -beta * Math.log(t / xmin) - rate * (t - xmin);
}

/** The baseline's survival curve over a range, from xmin. */
export function baselineCurve(
  parameters: BaselineParameters,
  xminSeconds: number,
  xmaxSeconds: number,
  points = 50,
): SurvivalCurve {
  const rate = tailRate(parameters);
  const durations = logSpaced(xminSeconds, xmaxSeconds, points);
  return {
    durations,
    survival: durations.map((t) => Math.exp(logSurvival(t, xminSeconds, parameters.beta, rate))),
  };
}

/** The baseline's parameters from its exponent and tail rate, with no tail below the least rate. */
function parametersOf(beta: number, rate: number): BaselineParameters {
  return { beta, tauSeconds: rate <= NO_TAIL_RATE ? null : 1 / rate };
}

/**
 * Fits the baseline to bout durations by maximum likelihood. Durations scored in bins count as the
 * bin they fell in. Null for fewer bouts than a bout shape needs.
 */
export function fitBaselineToDurations(
  durations: readonly number[],
  options: FitOptions,
): BaselineParameters | null {
  const { xminSeconds: xmin, binSeconds: bin } = options;
  // Measured from 0, as the baseline's form is in t itself.
  const counts = groupDurations(durations, xmin, 0);
  if (groupedCount(counts) < MIN_BOUTS) return null;
  const logLikelihood = (beta: number, rate: number): number => {
    let sum = 0;
    for (const [t, count] of counts) {
      const here = logSurvival(t, xmin, beta, rate);
      sum +=
        count *
        (bin > 0
          ? here + Math.log(-Math.expm1(logSurvival(t + bin, xmin, beta, rate) - here))
          : here + Math.log(beta / t + rate));
    }
    return sum;
  };
  const bestRate = (beta: number): number =>
    Math.exp(
      maximise((logRate) => logLikelihood(beta, Math.exp(logRate)), Math.log(1e-9), Math.log(10)),
    );
  const beta = maximise((each) => logLikelihood(each, bestRate(each)), 0, 4);
  return parametersOf(beta, bestRate(beta));
}

/**
 * Fits the baseline to a published fit's survival curve, where a source gives only its fit and
 * not its data. log S = −β log(t/xmin) − (t − xmin)/τ is linear in β and 1/τ, so least squares
 * solves it directly, with neither below 0.
 */
export function fitBaselineToCurve(curve: SurvivalCurve, xminSeconds: number): BaselineParameters {
  const rows = curve.durations.flatMap((t, index) => {
    const s = curve.survival[index] ?? 0;
    return s > 0 ? [{ a: Math.log(t / xminSeconds), b: t - xminSeconds, y: -Math.log(s) }] : [];
  });
  const sum = (f: (row: (typeof rows)[number]) => number) =>
    rows.reduce((total, row) => total + f(row), 0);
  const [aa, ab, bb] = [sum((r) => r.a * r.a), sum((r) => r.a * r.b), sum((r) => r.b * r.b)];
  const [ay, by] = [sum((r) => r.a * r.y), sum((r) => r.b * r.y)];
  const determinant = aa * bb - ab * ab;
  let [beta, rate] =
    determinant > 0
      ? [(ay * bb - by * ab) / determinant, (by * aa - ay * ab) / determinant]
      : [0, 0];
  // Where either would be negative, it is 0, and the other is fitted alone.
  if (beta < 0 || rate < 0 || determinant <= 0) {
    const powerOnly = aa > 0 ? ay / aa : 0;
    const tailOnly = bb > 0 ? by / bb : 0;
    const error = (b: number, r: number) => sum((row) => (row.y - b * row.a - r * row.b) ** 2);
    [beta, rate] =
      error(Math.max(0, powerOnly), 0) <= error(0, Math.max(0, tailOnly))
        ? [Math.max(0, powerOnly), 0]
        : [0, Math.max(0, tailOnly)];
  }
  return parametersOf(beta, rate);
}

/**
 * How far two survival curves are apart over a range: the largest gap, from 0 to 1, in the share
 * of bouts lasting at least each of 50 durations spaced evenly on a log scale.
 */
export function curveDistance(
  a: (seconds: number) => number,
  b: (seconds: number) => number,
  xminSeconds: number,
  xmaxSeconds: number,
): number {
  return Math.max(...logSpaced(xminSeconds, xmaxSeconds, 50).map((t) => Math.abs(a(t) - b(t))));
}

/** Bout durations' survival at a duration, as a share of those lasting at least xmin. */
export function empiricalSurvival(
  durations: readonly number[],
  xminSeconds: number,
): (seconds: number) => number {
  const sorted = durations.filter((each) => each >= xminSeconds).sort((p, q) => p - q);
  return (t) => {
    if (sorted.length === 0) return 0;
    let [low, high] = [0, sorted.length];
    // The first duration at least t long.
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((sorted[middle] ?? Infinity) < t - 1e-9) low = middle + 1;
      else high = middle;
    }
    return (sorted.length - low) / sorted.length;
  };
}

/** The baseline's survival at a duration. */
export function baselineSurvival(
  parameters: BaselineParameters,
  xminSeconds: number,
): (seconds: number) => number {
  const rate = tailRate(parameters);
  return (t) => Math.exp(logSurvival(t, xminSeconds, parameters.beta, rate));
}
