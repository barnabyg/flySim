import type { Disagreement, DisagreementMeasure } from "../validation/disagreement";
import type { AssayDisagreement, ValidationReport } from "../validation/report";
import { BEHAVIOUR_COLOURS } from "./palette";
import { Chart, PLOT, escapeHtml, formatNumber, linePath, tipRow } from "./validationChart";

/** Each direction in the colour of what the fly really was: awake and still, or asleep. */
const DIRECTIONS = [
  {
    key: "awakeScoredAsSleep",
    name: "Awake, scored as sleep",
    colour: BEHAVIOUR_COLOURS.immobility,
    against: "of Scored Sleep",
    bouts: "awake stretches of 5 min or more",
  },
  {
    key: "sleepNotScored",
    name: "Asleep, not scored",
    colour: BEHAVIOUR_COLOURS.sleeping,
    against: "of true sleep",
    bouts: "sleep bouts missed entirely",
  },
] as const;

type Direction = (typeof DIRECTIONS)[number];
type Scale = "minutes" | "bouts";

function byHour(measure: DisagreementMeasure, scale: Scale): readonly number[] {
  return scale === "minutes" ? measure.minutesByHour : measure.boutsByHour;
}

function percent(share: number | null): string {
  return share === null ? "—" : `${formatNumber(share * 100)}%`;
}

function chart(
  assay: AssayDisagreement,
  pooled: Disagreement,
  scale: Scale,
  tips: string[],
): string {
  const unit = scale === "minutes" ? "min per hour" : "bouts per hour";
  const values = DIRECTIONS.flatMap((direction) => [
    ...byHour(pooled[direction.key], scale),
    ...assay.perFly.flatMap((fly) => byHour(fly[direction.key], scale)),
  ]);
  const built = new Chart(tips, values, unit, true);
  const { y } = built;
  const binWidth = (PLOT.right - PLOT.left) / 24;
  const x = (hour: number) => PLOT.left + (hour + 0.5) * binWidth;
  for (const direction of DIRECTIONS) {
    for (const fly of assay.perFly) {
      built.parts.push(
        `<path class="fly-line" data-seed="${fly.seed}" d="${linePath(byHour(fly[direction.key], scale), x, y)}" stroke="${direction.colour}"/>`,
      );
    }
  }
  for (const direction of DIRECTIONS) {
    built.parts.push(
      `<path class="pooled-line" data-direction="${direction.key}" d="${linePath(byHour(pooled[direction.key], scale), x, y)}" stroke="${direction.colour}"/>`,
    );
  }
  for (let hour = 0; hour < 24; hour++) {
    if (hour % 2 === 0) {
      built.parts.push(
        `<text class="category" x="${x(hour).toFixed(1)}" y="${PLOT.bottom + 18}" text-anchor="middle">ZT${hour}</text>`,
      );
    }
    const rows = DIRECTIONS.map((direction) => {
      const flies = assay.perFly.map((fly) => byHour(fly[direction.key], scale)[hour] ?? 0);
      const range =
        flies.length > 0
          ? ` <span class="tooltip-dim">flies ${formatNumber(Math.min(...flies))}–${formatNumber(Math.max(...flies))}</span>`
          : "";
      return tipRow(
        direction.colour,
        direction.name,
        `${formatNumber(byHour(pooled[direction.key], scale)[hour] ?? 0)}${range}`,
      );
    });
    built.parts.push(
      `<rect class="bin" data-bin="${hour}" x="${(x(hour) - binWidth / 2).toFixed(1)}" y="${PLOT.top}" width="${binWidth.toFixed(1)}" height="${PLOT.bottom - PLOT.top}" ${built.tip(`<div class="tooltip-heading">ZT${hour}–${hour + 1} · ${unit}, all flies</div>${rows.join("")}`)}/>`,
    );
  }
  return built.svg(`${assay.title}: Scoring Disagreement in ${unit}`);
}

function summary(direction: Direction, pooled: Disagreement, tips: string[]): string {
  const measure = pooled[direction.key];
  tips.push(
    [
      `<div class="tooltip-heading">${direction.name}, all flies</div>`,
      tipRow(direction.colour, `Share ${direction.against}`, percent(measure.share)),
      tipRow(null, "Minutes a day", formatNumber(measure.minutesPerDay)),
      tipRow(null, `Bouts a day: ${direction.bouts}`, formatNumber(measure.boutsPerDay)),
    ].join(""),
  );
  return `<span class="disagreement-figure" data-direction="${direction.key}" data-tip="${tips.length - 1}"><span class="swatch" style="background:${direction.colour}"></span>${direction.name}: <b>${percent(measure.share)}</b> ${direction.against}, ${formatNumber(measure.boutsPerDay)} bouts a day</span>`;
}

function assayHtml(assay: AssayDisagreement, tips: string[]): string {
  const { pooled } = assay;
  const body =
    pooled === null
      ? `<p class="chart-message">No fly lived through this assay's record.</p>`
      : `<div class="disagreement-figures">${DIRECTIONS.map((direction) => summary(direction, pooled, tips)).join("")}</div>
        <div class="scale-switch" role="group" aria-label="Show as">
          <button type="button" data-scale="minutes" aria-pressed="true">Time</button>
          <button type="button" data-scale="bouts" aria-pressed="false">Bouts</button>
        </div>
        <div data-scale-chart="minutes">${chart(assay, pooled, "minutes", tips)}</div>
        <div data-scale-chart="bouts" hidden>${chart(assay, pooled, "bouts", tips)}</div>`;
  return `<article class="target" data-disagreement-id="${escapeHtml(assay.id)}">
    <header class="target-header"><h2>${escapeHtml(assay.title)}</h2></header>
    <p class="result-description">Used by ${assay.targets.map(escapeHtml).join(", ")}. ${assay.perFly.length} flies.</p>
    ${body}
  </article>`;
}

/**
 * How often each Virtual Assay's Scored Sleep disagrees with the true Vigilance State, in both
 * directions, as time and as bouts, across the day.
 */
export function disagreementHtml(report: ValidationReport, tips: string[]): string {
  if (report.disagreement.length === 0) return "";
  const legend = DIRECTIONS.map(
    (direction) =>
      `<span><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1 8h14" stroke="${direction.colour}" stroke-width="3"/></svg>${direction.name}</span>`,
  ).join("");
  return `<section id="validation-disagreement" class="validation-section">
    <h2>Scoring Disagreement</h2>
    <p class="section-note" id="disagreement-note">A measure of the 5-minute rule, not a Validation Target: it never decides whether the model passes. It sets each assay's Scored Sleep beside the fly's true Vigilance State, which no lab can see. Thick lines are all flies together and thin ones each fly.</p>
    <div class="chart-legend">${legend}</div>
    <div class="targets disagreement-assays">${report.disagreement.map((assay) => assayHtml(assay, tips)).join("")}</div>
  </section>`;
}

/** Switches an assay's charts between time and bouts. */
export function handleScaleSwitch(event: Event): void {
  const button = event.target instanceof Element ? event.target.closest("[data-scale]") : null;
  const group = button?.closest(".target");
  if (!button || !group) return;
  const scale = button.getAttribute("data-scale");
  for (const each of group.querySelectorAll("[data-scale]")) {
    each.setAttribute("aria-pressed", String(each === button));
  }
  for (const each of group.querySelectorAll<HTMLElement>("[data-scale-chart]")) {
    each.hidden = each.getAttribute("data-scale-chart") !== scale;
  }
}
