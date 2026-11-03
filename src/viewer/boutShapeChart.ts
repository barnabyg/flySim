import {
  EXPONENTIAL_SHAPE_RANGE,
  SIGNIFICANCE,
  type BoutKindShape,
  type SurvivalCurve,
} from "../validation/boutShapes";
import type { AssayBoutShapes, ValidationReport } from "../validation/report";
import { VALIDATION_COLOURS as COLOURS } from "./palette";
import { HEIGHT, PLOT, WIDTH, escapeHtml, formatNumber, tipRow } from "./validationChart";

export type SurvivalAxes = "loglog" | "loglinear";

/** The lowest survival a log axis shows. */
const LOG_FLOOR = 1e-4;

/** How many columns along a chart show their numbers on hover. */
const COLUMNS = 32;

const KIND_NAMES = { inactivity: "Inactivity Bouts", activity: "Activity Bouts" } as const;
const EXPECTED_NAMES = {
  falling: "a falling hazard",
  exponential: "close to exponential",
} as const;

/** Another curve drawn on a bout-shape chart, such as a descriptive baseline. */
export interface ExtraCurve {
  readonly name: string;
  readonly colour: string;
  readonly className: string;
  readonly curve: SurvivalCurve;
}

/** A survival curve's value at a duration: the share of bouts lasting at least that long. */
export function survivalAt(curve: SurvivalCurve, seconds: number): number | null {
  const { durations, survival } = curve;
  if (durations.length === 0 || seconds < (durations[0] ?? 0) - 1e-9) return null;
  let index = 0;
  while (index + 1 < durations.length && (durations[index + 1] ?? 0) <= seconds + 1e-9) index += 1;
  if (seconds > (durations.at(-1) ?? 0) + 1e-9) return 0;
  return survival[index] ?? null;
}

/** The exponential that best fits the pooled bouts, as a survival curve from xmin. */
export function exponentialCurve(kind: BoutKindShape, until: number): SurvivalCurve | null {
  const mean = kind.pooled.test.exponentialMeanSeconds;
  if (mean === null || mean <= 0) return null;
  const durations = Array.from(
    { length: 60 },
    (_, index) => kind.xminSeconds * (until / kind.xminSeconds) ** (index / 59),
  );
  return {
    durations,
    survival: durations.map((t) => Math.exp(-(t - kind.xminSeconds) / mean)),
  };
}

function decadeTicks(low: number, high: number): number[] {
  const ticks: number[] = [];
  for (let power = Math.floor(Math.log10(low)); power <= Math.ceil(Math.log10(high)); power++) {
    const tick = 10 ** power;
    if (tick >= low * 0.999 && tick <= high * 1.001) ticks.push(tick);
  }
  return ticks;
}

function seconds(value: number): string {
  if (value >= 3600) return `${formatNumber(value / 3600)} h`;
  if (value >= 60) return `${formatNumber(value / 60)} min`;
  return `${formatNumber(value)} s`;
}

/** Draws survival curves on a log duration axis, with a log or linear survival axis. */
function chartSvg(
  title: string,
  kind: BoutKindShape,
  extras: readonly ExtraCurve[],
  axes: SurvivalAxes,
  tips: string[],
): string {
  const curves = [kind.pooled.curve, ...kind.perFly.map((fly) => fly.curve)];
  const longest = Math.max(
    kind.xminSeconds * 10,
    ...curves.flatMap((curve) => curve.durations),
    ...extras.flatMap((extra) => extra.curve.durations),
  );
  const exponential = exponentialCurve(kind, longest);
  const [xLow, xHigh] = [Math.log10(kind.xminSeconds), Math.log10(longest)];
  const x = (t: number) =>
    PLOT.left + ((Math.log10(t) - xLow) / (xHigh - xLow)) * (PLOT.right - PLOT.left);
  const y =
    axes === "loglog"
      ? (s: number) =>
          PLOT.top +
          (-Math.log10(Math.max(s, LOG_FLOOR)) / -Math.log10(LOG_FLOOR)) * (PLOT.bottom - PLOT.top)
      : (s: number) => PLOT.top + (1 - s) * (PLOT.bottom - PLOT.top);
  const path = (curve: SurvivalCurve) =>
    curve.durations
      .flatMap((t, index) => {
        const s = curve.survival[index] ?? 0;
        // A log axis can't show a share of 0, so the line stops there.
        if (axes === "loglog" && s <= 0) return [];
        return [`${x(t).toFixed(1)},${y(s).toFixed(1)}`];
      })
      .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
      .join("");

  const parts: string[] = [];
  const yTicks = axes === "loglog" ? decadeTicks(LOG_FLOOR, 1) : [0, 0.25, 0.5, 0.75, 1];
  for (const tick of yTicks) {
    const at = y(tick).toFixed(1);
    parts.push(
      `<line class="grid" x1="${PLOT.left}" x2="${PLOT.right}" y1="${at}" y2="${at}"/>`,
      `<text class="tick" x="${PLOT.left - 6}" y="${at}" text-anchor="end" dominant-baseline="middle">${formatNumber(tick)}</text>`,
    );
  }
  for (const tick of [kind.xminSeconds, ...decadeTicks(kind.xminSeconds * 1.5, longest)]) {
    const at = x(tick).toFixed(1);
    parts.push(
      `<line class="grid" x1="${at}" x2="${at}" y1="${PLOT.top}" y2="${PLOT.bottom}"/>`,
      // Decades read most plainly in seconds, as the axis is.
      `<text class="category" x="${at}" y="${PLOT.bottom + 18}" text-anchor="middle">${formatNumber(tick)} s</text>`,
    );
  }
  parts.push(
    `<text class="axis-label" transform="translate(14 ${(PLOT.top + PLOT.bottom) / 2}) rotate(-90)" text-anchor="middle">Share lasting at least</text>`,
  );
  for (const fly of kind.perFly) {
    parts.push(
      `<path class="fly-line" data-seed="${fly.seed}" d="${path(fly.curve)}" stroke="${COLOURS.model}"/>`,
    );
  }
  if (exponential) {
    parts.push(
      `<path class="reference-line" data-curve="exponential" d="${path(exponential)}" stroke="${COLOURS.accepted}"/>`,
    );
  }
  for (const extra of extras) {
    parts.push(
      `<path class="${extra.className}" data-curve="${escapeHtml(extra.name)}" d="${path(extra.curve)}" stroke="${extra.colour}"/>`,
    );
  }
  parts.push(
    `<path class="pooled-line" data-curve="pooled" d="${path(kind.pooled.curve)}" stroke="${COLOURS.model}"/>`,
  );

  // Columns spaced evenly on the log axis, each giving every curve's value there on hover.
  const width = (PLOT.right - PLOT.left) / COLUMNS;
  for (let column = 0; column < COLUMNS; column++) {
    const t = 10 ** (xLow + ((column + 0.5) / COLUMNS) * (xHigh - xLow));
    const value = (s: number | null) => (s === null ? "—" : formatNumber(s));
    const flies = kind.perFly
      .map((fly) => survivalAt(fly.curve, t))
      .filter((s): s is number => s !== null);
    const rows = [
      `<div class="tooltip-heading">At least ${seconds(t)} · share of bouts</div>`,
      tipRow(COLOURS.model, "Pooled", value(survivalAt(kind.pooled.curve, t))),
      ...(flies.length > 0
        ? [
            tipRow(
              null,
              "Flies",
              `${formatNumber(Math.min(...flies))}–${formatNumber(Math.max(...flies))}`,
            ),
          ]
        : []),
      ...(exponential
        ? [tipRow(COLOURS.accepted, "Exponential", value(survivalAt(exponential, t)))]
        : []),
      ...extras.map((extra) => tipRow(extra.colour, extra.name, value(survivalAt(extra.curve, t)))),
    ];
    tips.push(rows.join(""));
    parts.push(
      `<rect class="bin" data-column="${column}" x="${(PLOT.left + column * width).toFixed(1)}" y="${PLOT.top}" width="${width.toFixed(1)}" height="${PLOT.bottom - PLOT.top}" data-tip="${tips.length - 1}"/>`,
    );
  }
  return `<svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(title)}">${parts.join("")}</svg>`;
}

/** What the test found at each step size, and how far the step sizes agree. */
function resultsHtml(assay: AssayBoutShapes, kind: BoutKindShape["bouts"]): string {
  const rows = assay.stepSizes.flatMap(({ stepsPerSecond, kinds }) => {
    const shape = kinds.find((each) => each.bouts === kind);
    if (!shape) return [];
    const pooling = shape.fallingOnlyWhenPooled
      ? " A falling hazard shows only when pooled."
      : " No falling hazard shows only when pooled.";
    return [
      `<li data-steps="${stepsPerSecond}" data-pass="${shape.pass}"><span class="result" data-result="${shape.pass ? "pass" : "fail"}">${shape.pass ? "Pass" : "Fail"}</span> ${stepsPerSecond} steps/s: ${escapeHtml(shape.description)}${pooling}</li>`,
    ];
  });
  const agreement = assay.agreement
    .filter((each) => each.bouts === kind)
    .map(
      (each) =>
        `<li data-agreement="${each.stepsPerSecond.join("-")}"><span class="result" data-result="${each.pass ? "pass" : "fail"}">${each.pass ? "Pass" : "Fail"}</span> ${each.stepsPerSecond[0]} and ${each.stepsPerSecond[1]} steps/s differ by ${each.distance === null ? "—" : formatNumber(each.distance)}, at most ${formatNumber(each.tolerance)}.</li>`,
    );
  return `<ul class="shape-results">${[...rows, ...agreement].join("")}</ul>`;
}

/** A chart of one kind of bout in one assay, with the switch between axes. */
export function boutKindHtml(
  assay: AssayBoutShapes,
  kind: BoutKindShape,
  extras: readonly ExtraCurve[],
  extraHtml: string,
  tips: string[],
): string {
  const title = `${assay.title}: ${KIND_NAMES[kind.bouts]}`;
  return `<article class="target" data-bout-shape="${escapeHtml(assay.id)}" data-bouts="${kind.bouts}">
    <header class="target-header"><h2>${escapeHtml(title)}</h2></header>
    <p class="result-description">Expected: ${EXPECTED_NAMES[kind.expected]}, per fly and pooled, for bouts at least ${seconds(kind.xminSeconds)} long.</p>
    ${resultsHtml(assay, kind.bouts)}
    ${extraHtml}
    <div class="scale-switch" role="group" aria-label="Axes">
      <button type="button" data-scale="loglog" aria-pressed="true">Log–log</button>
      <button type="button" data-scale="loglinear" aria-pressed="false">Log–linear</button>
    </div>
    <div data-scale-chart="loglog">${chartSvg(`${title}, log–log`, kind, extras, "loglog", tips)}</div>
    <div data-scale-chart="loglinear" hidden>${chartSvg(`${title}, log–linear`, kind, extras, "loglinear", tips)}</div>
  </article>`;
}

const LEGEND = [
  ["Fly", `<path d="M1 8h14" stroke="${COLOURS.model}" stroke-width="1" opacity="0.5"/>`],
  ["Pooled", `<path d="M1 8h14" stroke="${COLOURS.model}" stroke-width="3"/>`],
  [
    "Exponential fit",
    `<path d="M1 8h14" stroke="${COLOURS.accepted}" stroke-width="1.5" stroke-dasharray="3 2"/>`,
  ],
] as const;

/**
 * Bout shapes for each assay that scores bouts: survival curves per fly and pooled, at the suite's
 * step size, with an exponential for reference and the test's results at each step size.
 */
export function boutShapesHtml(
  report: ValidationReport,
  tips: string[],
  extrasFor: (
    assay: AssayBoutShapes,
    kind: BoutKindShape,
  ) => { curves: readonly ExtraCurve[]; html: string; legend: string } = () => ({
    curves: [],
    html: "",
    legend: "",
  }),
): string {
  if (report.boutShapes.length === 0) return "";
  const charts: string[] = [];
  const legends = new Set<string>();
  for (const assay of report.boutShapes) {
    const own =
      assay.stepSizes.find((each) => each.stepsPerSecond === report.stepsPerSecond) ??
      assay.stepSizes[0];
    for (const kind of own?.kinds ?? []) {
      const extras = extrasFor(assay, kind);
      if (extras.legend !== "") legends.add(extras.legend);
      charts.push(boutKindHtml(assay, kind, extras.curves, extras.html, tips));
    }
  }
  const legend = LEGEND.map(
    ([name, icon]) =>
      `<span><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${icon}</svg>${name}</span>`,
  ).join("");
  return `<section id="validation-bout-shapes" class="validation-section">
    <h2>Bout shapes</h2>
    <p class="section-note">ADR-0001's first validation stage: Inactivity Bouts must have a falling hazard and Activity Bouts must be close to exponential, per fly as well as pooled, at every step size tested. The test is a likelihood ratio of a Weibull fit against an exponential one, at the ${formatNumber(SIGNIFICANCE * 100)}% level, where a Weibull shape within ${formatNumber(EXPONENTIAL_SHAPE_RANGE.low)} to ${formatNumber(EXPONENTIAL_SHAPE_RANGE.high)} still counts as close to exponential. The curves are at the suite's own step size.</p>
    <div class="chart-legend">${legend}${[...legends].join("")}</div>
    <div class="targets">${charts.join("")}</div>
  </section>`;
}
