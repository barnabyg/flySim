import type { BaselineParameters } from "../validation/baseline";
import type { BoutKindShape, SurvivalCurve } from "../validation/boutShapes";
import type { AssayBoutShapes, ValidationReport } from "../validation/report";
import type { BoutBaseline } from "../validation/targetBaselines";
import { survivalAt, type ExtraCurve } from "./boutShapeChart";
import { VALIDATION_COLOURS as COLOURS } from "./palette";
import { escapeHtml, formatNumber } from "./validationChart";

/** "light" for a comparison in the light, as its id ends, or null for one over the whole day. */
function phaseOf(baseline: BoutBaseline): string | null {
  const [, phase] = baseline.id.split(":");
  return phase === undefined ? null : phase;
}

function named(name: string, baseline: BoutBaseline): string {
  const phase = phaseOf(baseline);
  return phase === null ? name : `${name}, ${phase}`;
}

/**
 * A curve that starts at xmin, drawn from where the model's pooled curve is at that duration, so
 * it can be read against the model's bouts whatever xmin the chart starts at.
 */
function anchored(curve: SurvivalCurve, at: number): SurvivalCurve {
  return { durations: curve.durations, survival: curve.survival.map((each) => each * at) };
}

function parametersText({ beta, tauSeconds }: BaselineParameters): string {
  return `β ${formatNumber(beta)}, ${tauSeconds === null ? "no exponential tail" : `τ ${formatNumber(tauSeconds)} s`}`;
}

function distanceText(distance: number | null): string {
  return distance === null ? "—" : formatNumber(distance);
}

function detailsHtml(baseline: BoutBaseline, tips: string[]): string {
  tips.push(
    [
      `<div class="tooltip-heading">Descriptive baseline</div>`,
      `<div class="tooltip-text">${escapeHtml(baseline.form)}</div>`,
      `<div class="tooltip-text">Fitted to ${escapeHtml(baseline.fittedTo)} ${escapeHtml(baseline.method)}</div>`,
      `<div class="tooltip-note">Fitted to the model's bouts, ${escapeHtml(baseline.modelFitMethod.charAt(0).toLowerCase())}${escapeHtml(baseline.modelFitMethod.slice(1))}</div>`,
    ].join(""),
  );
  const heldOut = baseline.heldOut ? ' <span class="held-out">Held out</span>' : "";
  const phase = phaseOf(baseline);
  const span = phase === null ? "over the whole day" : `in the ${phase}`;
  return `<div class="baseline" data-baseline-id="${escapeHtml(baseline.id)}" data-tip="${tips.length - 1}">
    <b>Descriptive baseline</b>${heldOut}, ${escapeHtml(span)}, ${formatNumber(baseline.xminSeconds)}–${formatNumber(baseline.xmaxSeconds)} s: ${parametersText(baseline.fitted)}.
    The model's bouts are <b data-distance="model">${distanceText(baseline.distance.model)}</b> from it, and the published data <b data-distance="published">${distanceText(baseline.distance.published)}</b>.
    ${baseline.modelFit === null ? "" : `Fitted to the model's bouts, the same form gives ${parametersText(baseline.modelFit)}.`}
  </div>`;
}

/**
 * The published data and the descriptive baseline for a bout-shape chart, from every baseline of a
 * target measured with that assay and of that kind of bout.
 */
export function baselineExtras(
  report: ValidationReport,
  tips: string[],
): (
  assay: AssayBoutShapes,
  kind: BoutKindShape,
) => { curves: ExtraCurve[]; html: string; legend: string } {
  return (assay, kind) => {
    const baselines = report.baselines.filter(
      (each) => assay.targets.includes(each.targetId) && each.bouts === kind.bouts,
    );
    if (baselines.length === 0) return { curves: [], html: "", legend: "" };
    const curves = baselines.flatMap((baseline) => {
      const at = survivalAt(kind.pooled.curve, baseline.xminSeconds) ?? 1;
      return [
        {
          name: named("Published", baseline),
          colour: COLOURS.published,
          className: "published-line",
          curve: anchored(baseline.published, at),
        },
        {
          name: named("Baseline", baseline),
          colour: COLOURS.baseline,
          className: "baseline-line",
          curve: anchored(baseline.baseline, at),
        },
      ];
    });
    const legend = [
      `<span><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1 8h14" stroke="${COLOURS.published}" stroke-width="2"/></svg>Published fit</span>`,
      `<span><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1 8h14" stroke="${COLOURS.baseline}" stroke-width="2" stroke-dasharray="5 2 1 2"/></svg>Descriptive baseline, not the model</span>`,
    ].join("");
    return {
      curves,
      html: `<div class="baselines">${baselines.map((each) => detailsHtml(each, tips)).join("")}</div>`,
      legend,
    };
  };
}
