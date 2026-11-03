/**
 * Bout shapes: whether bout durations are exponential, as a memoryless process gives, or have a
 * falling hazard, as a heavy tail does. ADR-0001's first validation stage needs non-exponential
 * Inactivity Bouts and near-exponential Activity Bouts, per fly as well as pooled, as pooling flies
 * that differ can itself make a falling hazard.
 *
 * The test fits a Weibull distribution, whose hazard falls for a shape below 1, rises above 1 and
 * is constant at exactly 1, to the bouts at least xmin long, measured from xmin. A likelihood-ratio
 * test then asks whether the Weibull fits better than an exponential, its shape fixed at 1. An
 * assay scores durations in whole bins, so each duration counts as the bin it fell in, which an
 * exponential fits exactly however coarse the bins are.
 */

/** The significance level of the likelihood-ratio test. */
export const SIGNIFICANCE = 0.01;

/**
 * How far from 1 a Weibull shape can be and still be close to exponential, when there are so many
 * bouts that the test finds even a small departure: a hazard that changes by less than about a
 * quarter over a bout's typical length.
 */
export const EXPONENTIAL_SHAPE_RANGE = { low: 0.8, high: 1.25 } as const;

/** The fewest bouts a fly needs for its own verdict. */
export const MIN_BOUTS = 20;

/** What the test says of a set of bouts. */
export type BoutShapeVerdict =
  /** A falling hazard: the longer a bout lasts, the less likely it is to end. */
  | "falling"
  /** Consistent with exponential: no change of hazard the test can find, or only a small one. */
  | "exponential"
  /** A rising hazard. */
  | "rising"
  | "too-few";

export interface BoutShapeTest {
  /** How many bouts were at least xmin long. */
  readonly n: number;
  /** The fitted Weibull shape, or null with too few bouts. */
  readonly shape: number | null;
  /** The exponential's fitted mean beyond xmin, in seconds, for drawing it. */
  readonly exponentialMeanSeconds: number | null;
  /** The chance of so large a likelihood ratio if the bouts were exponential. */
  readonly pValue: number | null;
  readonly verdict: BoutShapeVerdict;
}

export interface FitOptions {
  /** Bouts shorter than this are left out, and the rest measured from it. */
  readonly xminSeconds: number;
  /** The width of the bins durations were scored in, or 0 for exact durations. */
  readonly binSeconds: number;
}

/** Durations from xmin, grouped by value, as a scored record repeats the same few values. */
function grouped(durations: readonly number[], xmin: number): Map<number, number> {
  const counts = new Map<number, number>();
  for (const each of durations) {
    if (each < xmin) continue;
    // Rounded so that durations of the same number of bins group together.
    const y = Math.round((each - xmin) * 1e6) / 1e6;
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  return counts;
}

/** A Weibull's log-likelihood of the grouped durations, with shape k and scale λ. */
function logLikelihood(
  counts: ReadonlyMap<number, number>,
  k: number,
  lambda: number,
  bin: number,
): number {
  let sum = 0;
  for (const [y, count] of counts) {
    const a = (y / lambda) ** k;
    if (bin > 0) {
      // The chance of a duration in [y, y + bin): S(y) − S(y + bin).
      const b = ((y + bin) / lambda) ** k;
      sum += count * (-a + Math.log(-Math.expm1(-(b - a))));
    } else {
      sum += count * (Math.log(k / lambda) + (k - 1) * Math.log(y / lambda) - a);
    }
  }
  return sum;
}

/** The value in [low, high] at which a function with one peak there is highest. */
function maximise(f: (x: number) => number, low: number, high: number): number {
  const golden = (Math.sqrt(5) - 1) / 2;
  let [a, b] = [low, high];
  let c = b - golden * (b - a);
  let d = a + golden * (b - a);
  let [fc, fd] = [f(c), f(d)];
  for (let i = 0; i < 80 && b - a > 1e-7; i++) {
    if (fc < fd) {
      [a, c, fc] = [c, d, fd];
      d = a + golden * (b - a);
      fd = f(d);
    } else {
      [b, d, fd] = [d, c, fc];
      c = b - golden * (b - a);
      fc = f(c);
    }
  }
  return (a + b) / 2;
}

interface Fit {
  readonly shape: number;
  readonly scale: number;
  readonly logLikelihood: number;
}

/** The best scale for a shape, and the log-likelihood it gives. */
function fitScale(counts: ReadonlyMap<number, number>, k: number, bin: number): Fit {
  const ys = [...counts.keys()];
  const n = [...counts.values()].reduce((sum, each) => sum + each, 0);
  const mean = ys.reduce((sum, y) => sum + y * (counts.get(y) ?? 0), 0) / n + bin / 2;
  let scale: number;
  if (bin === 0) {
    // In closed form for exact durations.
    const moment = ys.reduce((sum, y) => sum + y ** k * (counts.get(y) ?? 0), 0) / n;
    scale = moment ** (1 / k);
  } else {
    const centre = Math.log(Math.max(mean, bin));
    scale = Math.exp(
      maximise(
        (logScale) => logLikelihood(counts, k, Math.exp(logScale), bin),
        centre - 12,
        centre + 12,
      ),
    );
  }
  return { shape: k, scale, logLikelihood: logLikelihood(counts, k, scale, bin) };
}

/** The Weibull that fits the durations best. */
function fitWeibull(counts: ReadonlyMap<number, number>, bin: number): Fit {
  const logShape = maximise(
    (logK) => fitScale(counts, Math.exp(logK), bin).logLikelihood,
    Math.log(0.05),
    Math.log(5),
  );
  return fitScale(counts, Math.exp(logShape), bin);
}

/** The complementary error function, to within about 1e-7 (Abramowitz and Stegun 7.1.26). */
function erfc(x: number): number {
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * Math.exp(-x * x);
}

/** Tests whether bout durations are exponential beyond xmin, or have a falling or rising hazard. */
export function testBoutShape(durations: readonly number[], options: FitOptions): BoutShapeTest {
  const counts = grouped(durations, options.xminSeconds);
  const n = [...counts.values()].reduce((sum, each) => sum + each, 0);
  // With every duration the same, no shape can be fitted.
  if (n < MIN_BOUTS || counts.size < 2) {
    return { n, shape: null, exponentialMeanSeconds: null, pValue: null, verdict: "too-few" };
  }
  const exponential = fitScale(counts, 1, options.binSeconds);
  const weibull = fitWeibull(counts, options.binSeconds);
  const ratio = Math.max(0, 2 * (weibull.logLikelihood - exponential.logLikelihood));
  // The ratio follows a chi-squared distribution with one degree of freedom for exponential bouts.
  const pValue = erfc(Math.sqrt(ratio / 2));
  const close =
    weibull.shape >= EXPONENTIAL_SHAPE_RANGE.low && weibull.shape <= EXPONENTIAL_SHAPE_RANGE.high;
  const verdict: BoutShapeVerdict =
    pValue >= SIGNIFICANCE || close ? "exponential" : weibull.shape < 1 ? "falling" : "rising";
  return {
    n,
    shape: weibull.shape,
    exponentialMeanSeconds: exponential.scale,
    pValue,
    verdict,
  };
}

/** A survival curve: the share of bouts at least xmin long that last at least each duration. */
export interface SurvivalCurve {
  readonly durations: readonly number[];
  readonly survival: readonly number[];
}

/** A survival curve at durations spaced evenly on a log scale, from xmin to the longest bout. */
export function survivalCurve(
  durations: readonly number[],
  xminSeconds: number,
  points = 40,
): SurvivalCurve {
  const sorted = durations.filter((each) => each >= xminSeconds).sort((a, b) => a - b);
  const longest = sorted.at(-1);
  if (longest === undefined) return { durations: [], survival: [] };
  const at: number[] = [];
  const survival: number[] = [];
  const ratio = longest / xminSeconds;
  let index = 0;
  for (let point = 0; point < points; point++) {
    const t =
      points === 1 || ratio <= 1 ? xminSeconds : xminSeconds * ratio ** (point / (points - 1));
    while (index < sorted.length && (sorted[index] ?? 0) < t - 1e-9) index += 1;
    if (at.length > 0 && t - (at.at(-1) ?? 0) < 1e-9) continue;
    at.push(t);
    survival.push((sorted.length - index) / sorted.length);
  }
  return { durations: at, survival };
}

/**
 * The two-sample Kolmogorov–Smirnov distance between two sets of durations at least xmin long:
 * the largest gap between their cumulative distributions at any duration, from 0 to 1.
 */
export function distributionDistance(
  a: readonly number[],
  b: readonly number[],
  xminSeconds: number,
): number | null {
  const [x, y] = [a, b].map((each) =>
    each.filter((value) => value >= xminSeconds).sort((p, q) => p - q),
  );
  if (!x || !y || x.length === 0 || y.length === 0) return null;
  let [i, j, distance] = [0, 0, 0];
  while (i < x.length && j < y.length) {
    const t = Math.min(x[i] ?? Infinity, y[j] ?? Infinity);
    while (i < x.length && (x[i] ?? Infinity) <= t) i += 1;
    while (j < y.length && (y[j] ?? Infinity) <= t) j += 1;
    distance = Math.max(distance, Math.abs(i / x.length - j / y.length));
  }
  return distance;
}

/**
 * Whether a falling hazard shows only when flies are pooled: the pooled bouts' hazard falls, but
 * fewer than half the flies with their own verdict show it.
 */
export function fallingOnlyWhenPooled(
  pooled: BoutShapeTest,
  perFly: readonly BoutShapeTest[],
): boolean {
  const judged = perFly.filter((fly) => fly.verdict !== "too-few");
  const falling = judged.filter((fly) => fly.verdict === "falling").length;
  return pooled.verdict === "falling" && falling * 2 < judged.length;
}

/** Bouts shorter than this are left out of every bout shape: Xu 2021's lower bound for its fits. */
export const BOUT_SHAPE_XMIN_SECONDS = 3;

/**
 * How far apart the pooled bout durations at two step sizes may be, as their two-sample
 * Kolmogorov–Smirnov distance. Another step size changes a run only by chance, so the
 * distributions should differ by little more than sampling.
 */
export const STEP_SIZE_TOLERANCE = 0.05;

export type BoutKind = "inactivity" | "activity";

/** What ADR-0001's first validation stage expects of each kind of bout. */
export const EXPECTED_SHAPE: Readonly<Record<BoutKind, "falling" | "exponential">> = {
  inactivity: "falling",
  activity: "exponential",
};

/** One kind of bout's shape in one assay at one step size, per fly and pooled. */
export interface BoutKindShape {
  readonly bouts: BoutKind;
  readonly expected: "falling" | "exponential";
  readonly xminSeconds: number;
  readonly perFly: readonly {
    readonly seed: number;
    readonly test: BoutShapeTest;
    readonly curve: SurvivalCurve;
  }[];
  readonly pooled: { readonly test: BoutShapeTest; readonly curve: SurvivalCurve };
  /** Whether the pooled bouts, and every fly with a verdict of its own, are as expected. */
  readonly pass: boolean;
  readonly fallingOnlyWhenPooled: boolean;
  readonly description: string;
}

const VERDICT_NAMES: Readonly<Record<BoutShapeVerdict, string>> = {
  falling: "a falling hazard",
  exponential: "consistent with exponential",
  rising: "a rising hazard",
  "too-few": "too few bouts",
};

/** A kind of bout's shape, from each fly's complete bout durations. */
export function boutKindShape(
  bouts: BoutKind,
  flies: readonly { readonly seed: number; readonly durations: readonly number[] }[],
  binSeconds: number,
): BoutKindShape {
  const options = { xminSeconds: BOUT_SHAPE_XMIN_SECONDS, binSeconds };
  const perFly = flies.map(({ seed, durations }) => ({
    seed,
    test: testBoutShape(durations, options),
    curve: survivalCurve(durations, BOUT_SHAPE_XMIN_SECONDS),
  }));
  const all = flies.flatMap((fly) => fly.durations);
  const pooled = {
    test: testBoutShape(all, options),
    curve: survivalCurve(all, BOUT_SHAPE_XMIN_SECONDS),
  };
  const expected = EXPECTED_SHAPE[bouts];
  const judged = perFly.filter((fly) => fly.test.verdict !== "too-few");
  const flyPasses = judged.filter((fly) => fly.test.verdict === expected).length;
  const pass = pooled.test.verdict === expected && flyPasses === judged.length;
  const shape = pooled.test.shape === null ? "" : `, Weibull shape ${pooled.test.shape.toFixed(2)}`;
  return {
    bouts,
    expected,
    xminSeconds: BOUT_SHAPE_XMIN_SECONDS,
    perFly,
    pooled,
    pass,
    fallingOnlyWhenPooled: fallingOnlyWhenPooled(
      pooled.test,
      perFly.map((fly) => fly.test),
    ),
    description: `Pooled, ${VERDICT_NAMES[pooled.test.verdict]}${shape} over ${pooled.test.n} bouts. ${flyPasses} of ${judged.length} flies with ${MIN_BOUTS} or more bouts show ${expected === "falling" ? "a falling hazard" : "a near-exponential shape"}.`,
  };
}
