import { DEFAULT_PARAMETERS, MODEL_VERSION } from "../engine";
import {
  REPORT_PATH,
  readValidationReport,
  staleness,
  type PublishedValue,
  type TargetResult,
  type ValidationReport,
} from "../validation/report";
import { VALIDATION_COLOURS as COLOURS } from "./palette";
import { baselineExtras } from "./baselineView";
import { boutShapesHtml } from "./boutShapeChart";
import { disagreementHtml } from "./disagreementChart";
import { relationshipsHtml } from "./relationshipList";
import {
  Chart,
  PLOT,
  escapeHtml,
  formatNumber,
  handleScaleSwitch,
  linePath,
  tipRow,
  withUnit,
} from "./validationChart";

const BACK_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HELD_OUT_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

/** The command that makes a report, run from the repo root. */
const VALIDATE_COMMAND = "npm run validate";

const UNCERTAINTY_NAMES: Readonly<Record<PublishedValue["uncertainty"]["kind"], string>> = {
  sem: "SEM",
  sd: "SD",
  ci95: "95% CI",
  iqr: "IQR",
  range: "range",
  none: "",
};

type Loaded =
  | { readonly kind: "report"; readonly report: ValidationReport }
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly reason: string };

export interface ValidationView {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

function asNumber(value: number | readonly number[] | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** One value per bin, with null where there is none. */
function asBins(value: number | readonly number[] | null, bins: number): (number | null)[] {
  return Array.from({ length: bins }, (_, bin) => {
    const each = Array.isArray(value) ? (value as readonly number[])[bin] : undefined;
    return typeof each === "number" && Number.isFinite(each) ? each : null;
  });
}

/** Consecutive seeds as a range, as "1–8, 12". */
function seedList(seeds: readonly number[]): string {
  const parts: string[] = [];
  let first: number | undefined;
  let last: number | undefined;
  const flush = () => {
    if (first === undefined || last === undefined) return;
    parts.push(first === last ? String(first) : `${first}–${last}`);
  };
  for (const seed of seeds) {
    if (last !== undefined && seed === last + 1) {
      last = seed;
    } else {
      flush();
      first = last = seed;
    }
  }
  flush();
  return parts.join(", ");
}

function localTime(iso: string): string {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : time.toLocaleString();
}

/**
 * The span a published value's uncertainty covers, in one bin of a profile or, with no bin, for a
 * scalar. A single number is a half-width either side, as is each number of a profile's list; a
 * scalar's list of two is the span's two ends.
 */
function uncertaintySpan(
  value: number,
  uncertainty: PublishedValue["uncertainty"],
  bin: number | null,
): { low: number; high: number; text: string } | null {
  const name = UNCERTAINTY_NAMES[uncertainty.kind];
  const spread = uncertainty.value;
  if (uncertainty.kind === "none" || spread === null) return null;
  const halfWidth = (half: number) =>
    Number.isFinite(half)
      ? { low: value - half, high: value + half, text: `± ${formatNumber(half)} ${name}` }
      : null;
  if (typeof spread === "number") return halfWidth(spread);
  if (bin !== null) {
    const half = spread[bin];
    return half === undefined ? null : halfWidth(half);
  }
  const [low, high] = spread;
  if (spread.length !== 2 || low === undefined || high === undefined) return null;
  return { low, high, text: `${name} ${formatNumber(low)} to ${formatNumber(high)}` };
}

/** A published value with its uncertainty, how many flies and where it comes from. */
function publishedTip(
  published: PublishedValue,
  value: number,
  bin: number | null,
  unit: string,
): string {
  const span = uncertaintySpan(value, published.uncertainty, bin);
  return [
    tipRow(
      COLOURS.published,
      escapeHtml(published.label),
      `${withUnit(value, unit)}${span ? ` ${span.text}` : ""}`,
    ),
    `<div class="tooltip-note">n ${published.n ?? "not given"} · ${escapeHtml(published.location)}</div>`,
  ].join("");
}

function scalarChart(
  target: TargetResult,
  accepted: { low: number; high: number },
  tips: string[],
): string {
  const published = target.published.flatMap((each) => {
    const value = asNumber(each.value);
    return value === null
      ? []
      : [{ each, value, span: uncertaintySpan(value, each.uncertainty, null) }];
  });
  const flies = target.model.perFly.flatMap((fly) => {
    const value = asNumber(fly.value);
    return value === null ? [] : [{ seed: fly.seed, value }];
  });
  const pooled = asNumber(target.model.pooled);
  const values = [
    accepted.low,
    accepted.high,
    ...published.flatMap(({ value, span }) => (span ? [value, span.low, span.high] : [value])),
    ...flies.map((fly) => fly.value),
    ...(pooled === null ? [] : [pooled]),
  ];
  const chart = new Chart(tips, values, target.unit, false);
  const { y } = chart;

  // The accepted interval lies behind everything, across every column.
  const [bandTop, bandBottom] = [y(accepted.high), y(accepted.low)];
  chart.parts.push(
    `<g data-mark="accepted" ${chart.tip(tipRow(COLOURS.accepted, "Accepted", `${formatNumber(accepted.low)} to ${withUnit(accepted.high, target.unit)}`))}>`,
    `<rect class="accepted" x="${PLOT.left}" y="${bandTop.toFixed(1)}" width="${PLOT.right - PLOT.left}" height="${(bandBottom - bandTop).toFixed(1)}" fill="${COLOURS.accepted}"/>`,
    ...[bandTop, bandBottom].map(
      (edge) =>
        `<line class="accepted-edge" x1="${PLOT.left}" x2="${PLOT.right}" y1="${edge.toFixed(1)}" y2="${edge.toFixed(1)}" stroke="${COLOURS.accepted}"/>`,
    ),
    "</g>",
  );

  const columns = published.length + 1;
  const columnWidth = (PLOT.right - PLOT.left) / columns;
  const centre = (column: number) => PLOT.left + (column + 0.5) * columnWidth;
  const label = (column: number, text: string) =>
    `<text class="category" x="${centre(column).toFixed(1)}" y="${PLOT.bottom + 20}" text-anchor="middle">${escapeHtml(text)}</text>`;

  published.forEach(({ each, value, span }, column) => {
    const x = centre(column).toFixed(1);
    const bar = span
      ? `<path class="error-bar" d="M${x},${y(span.low).toFixed(1)}V${y(span.high).toFixed(1)}M${(centre(column) - 7).toFixed(1)},${y(span.low).toFixed(1)}h14M${(centre(column) - 7).toFixed(1)},${y(span.high).toFixed(1)}h14" stroke="${COLOURS.published}"/>`
      : "";
    const top = span ? Math.min(y(span.high), y(value)) : y(value);
    const bottom = span ? Math.max(y(span.low), y(value)) : y(value);
    chart.parts.push(
      `<g data-mark="published" ${chart.tip(publishedTip(each, value, null, each.unit))}>`,
      `<rect class="hit" x="${(centre(column) - 14).toFixed(1)}" y="${(top - 6).toFixed(1)}" width="28" height="${(bottom - top + 12).toFixed(1)}"/>`,
      bar,
      `<circle cx="${x}" cy="${y(value).toFixed(1)}" r="5.5" fill="${COLOURS.published}"/>`,
      "</g>",
      label(column, each.label),
    );
  });

  const modelColumn = published.length;
  const spread = Math.min(columnWidth * 0.45, 140);
  const flyX = (index: number) =>
    centre(modelColumn) -
    spread * 0.6 +
    (flies.length > 1 ? (index / (flies.length - 1)) * spread : spread / 2);
  if (pooled !== null) {
    chart.parts.push(
      `<line class="pooled-guide" x1="${(flyX(0) - 8).toFixed(1)}" x2="${(centre(modelColumn) + spread * 0.6).toFixed(1)}" y1="${y(pooled).toFixed(1)}" y2="${y(pooled).toFixed(1)}" stroke="${COLOURS.model}"/>`,
    );
  }
  flies.forEach((fly, index) => {
    chart.parts.push(
      `<g data-mark="fly" data-seed="${fly.seed}" ${chart.tip(tipRow(COLOURS.model, `Seed ${fly.seed}`, withUnit(fly.value, target.unit)))}>`,
      `<circle class="hit" cx="${flyX(index).toFixed(1)}" cy="${y(fly.value).toFixed(1)}" r="8"/>`,
      `<circle class="fly" cx="${flyX(index).toFixed(1)}" cy="${y(fly.value).toFixed(1)}" r="4" fill="${COLOURS.model}"/>`,
      "</g>",
    );
  });
  if (pooled !== null) {
    const x = centre(modelColumn) + spread * 0.6;
    const yPooled = y(pooled);
    chart.parts.push(
      `<g data-mark="pooled" ${chart.tip(tipRow(COLOURS.model, "Pooled", withUnit(pooled, target.unit)))}>`,
      `<path class="pooled" d="M${x.toFixed(1)},${(yPooled - 8).toFixed(1)}l8,8l-8,8l-8,-8z" fill="${COLOURS.model}"/>`,
      "</g>",
    );
  }
  const withValue = flies.length === target.model.perFly.length;
  chart.parts.push(
    label(
      modelColumn,
      withValue
        ? `Model, ${flies.length} flies`
        : `Model, ${flies.length} of ${target.model.perFly.length} flies`,
    ),
  );
  return chart.svg(`${target.title} chart`);
}

function profileChart(target: TargetResult, binLabels: readonly string[], tips: string[]): string {
  const bins = binLabels.length;
  const published = target.published.map((each) => {
    const values = asBins(each.value, bins);
    const spans = values.map((value, bin) =>
      value === null ? null : uncertaintySpan(value, each.uncertainty, bin),
    );
    return { each, values, spans };
  });
  const flies = target.model.perFly.map((fly) => ({
    seed: fly.seed,
    values: asBins(fly.value, bins),
  }));
  const pooled = asBins(target.model.pooled, bins);
  const finite = (values: readonly (number | null)[]) =>
    values.filter((value): value is number => value !== null);
  const values = [
    ...published.flatMap(({ values: line, spans }) => [
      ...finite(line),
      ...spans.flatMap((span) => (span ? [span.low, span.high] : [])),
    ]),
    ...flies.flatMap((fly) => finite(fly.values)),
    ...finite(pooled),
  ];
  const chart = new Chart(tips, values, target.unit, true);
  const { y } = chart;
  const binWidth = (PLOT.right - PLOT.left) / Math.max(1, bins);
  const x = (bin: number) => PLOT.left + (bin + 0.5) * binWidth;

  for (const { spans } of published) {
    // The band's edges, drawn along the top and back along the bottom, wherever it has a span.
    const upper = spans.map((span) => span?.high ?? null);
    const lower = spans.map((span) => span?.low ?? null);
    if (finite(upper).length > 0) {
      const back = [...lower.keys()].reverse().filter((bin) => lower[bin] !== null);
      const along = linePath(upper, x, y);
      const returning = back
        .map((bin) => `L${x(bin).toFixed(1)},${y(lower[bin] ?? 0).toFixed(1)}`)
        .join("");
      chart.parts.push(
        `<path class="band" d="${along}${returning}Z" fill="${COLOURS.published}"/>`,
      );
    }
  }
  for (const fly of flies) {
    chart.parts.push(
      `<path class="fly-line" data-seed="${fly.seed}" d="${linePath(fly.values, x, y)}" stroke="${COLOURS.model}"/>`,
    );
  }
  published.forEach(({ values: line }, index) => {
    chart.parts.push(
      `<path class="published-line${index > 0 ? " dashed" : ""}" d="${linePath(line, x, y)}" stroke="${COLOURS.published}"/>`,
    );
  });
  chart.parts.push(
    `<path class="pooled-line" d="${linePath(pooled, x, y)}" stroke="${COLOURS.model}"/>`,
  );

  // Labels where they fit, and a column per bin that shows its numbers on hover.
  const every = Math.ceil(bins / 12);
  binLabels.forEach((binLabel, bin) => {
    if (bin % every === 0) {
      chart.parts.push(
        `<text class="category" x="${x(bin).toFixed(1)}" y="${PLOT.bottom + 18}" text-anchor="middle">${escapeHtml(binLabel)}</text>`,
      );
    }
    const rows = [
      // The unit is the same in every row, so the heading says it once.
      `<div class="tooltip-heading">${escapeHtml(binLabel)} · ${escapeHtml(target.unit)}</div>`,
      ...published.flatMap(({ each, values: line }) => {
        const value = line[bin];
        return value === null || value === undefined ? [] : [publishedTip(each, value, bin, "")];
      }),
      tipRow(
        COLOURS.model,
        "Pooled",
        pooled[bin] === null || pooled[bin] === undefined ? "—" : formatNumber(pooled[bin]),
      ),
      ...flies.map((fly) => {
        const value = fly.values[bin];
        return tipRow(
          null,
          `Seed ${fly.seed}`,
          value === null || value === undefined ? "—" : formatNumber(value),
        );
      }),
    ];
    chart.parts.push(
      `<rect class="bin" data-bin="${bin}" x="${(x(bin) - binWidth / 2).toFixed(1)}" y="${PLOT.top}" width="${binWidth.toFixed(1)}" height="${PLOT.bottom - PLOT.top}" ${chart.tip(rows.join(""))}/>`,
    );
  });
  return chart.svg(`${target.title} chart`);
}

const LEGENDS = {
  scalar: [
    [
      "Published",
      `<circle cx="8" cy="8" r="3.5" fill="${COLOURS.published}"/><path d="M8 2V14M5 2h6M5 14h6" stroke="${COLOURS.published}" stroke-width="1.4"/>`,
    ],
    ["Fly", `<circle cx="8" cy="8" r="3.5" fill="${COLOURS.model}" opacity="0.8"/>`],
    ["Pooled", `<path d="M8 2l6 6-6 6-6-6z" fill="${COLOURS.model}"/>`],
    [
      "Accepted",
      `<rect x="1" y="4" width="14" height="8" fill="${COLOURS.accepted}" opacity="0.15" stroke="${COLOURS.accepted}" stroke-dasharray="2 2" stroke-opacity="0.6"/>`,
    ],
  ],
  profile: [
    [
      "Published",
      `<rect x="1" y="4" width="14" height="8" fill="${COLOURS.published}" opacity="0.2"/><path d="M1 8h14" stroke="${COLOURS.published}" stroke-width="2"/>`,
    ],
    ["Fly", `<path d="M1 8h14" stroke="${COLOURS.model}" stroke-width="1" opacity="0.5"/>`],
    ["Pooled", `<path d="M1 8h14" stroke="${COLOURS.model}" stroke-width="3"/>`],
  ],
} as const;

/** The legend, saying which uncertainty the published values show. */
function legendHtml(kind: keyof typeof LEGENDS, target: TargetResult): string {
  const kinds = [
    ...new Set(
      target.published.flatMap(({ uncertainty }) =>
        uncertainty.kind === "none" || uncertainty.value === null
          ? []
          : [UNCERTAINTY_NAMES[uncertainty.kind]],
      ),
    ),
  ];
  const uncertainty = kinds.length === 0 ? "" : ` ± ${kinds.join(", ")}`;
  return `<div class="chart-legend">${LEGENDS[kind]
    .map(
      ([name, icon]) =>
        `<span><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${icon}</svg>${name}${name === "Published" ? uncertainty : ""}</span>`,
    )
    .join("")}</div>`;
}

function targetHtml(target: TargetResult, tips: string[]): string {
  let chart: string;
  let legend = "";
  try {
    const display = target.display;
    if (display.kind === "scalar") {
      chart = scalarChart(target, display.accepted, tips);
      legend = legendHtml("scalar", target);
    } else if ((display.kind as string) === "profile") {
      chart = profileChart(target, display.binLabels, tips);
      legend = legendHtml("profile", target);
    } else {
      chart = `<p class="chart-message">This viewer can't draw a ${escapeHtml(String((display as { kind: unknown }).kind))} chart.</p>`;
    }
  } catch {
    chart = `<p class="chart-message">This target's results can't be drawn.</p>`;
  }
  const { pass, description } = target.result;
  const heldOut = target.heldOut
    ? `<span class="held-out" data-held-out="true" title="Held out: reported, not tuned against">${HELD_OUT_ICON}Held out</span>`
    : "";
  return `<article class="target" data-target-id="${escapeHtml(target.id)}"${target.heldOut ? ' data-held-out="true"' : ""}>
    <header class="target-header">
      <h2>${escapeHtml(target.title)}</h2>
      ${heldOut}
      <span class="result" data-result="${pass ? "pass" : "fail"}" title="${escapeHtml(target.criterion.description)}">${pass ? "Pass" : "Fail"}</span>
    </header>
    <p class="citation">${escapeHtml(target.citation)}</p>
    <p class="result-description">${escapeHtml(description)}</p>
    ${legend}
    ${chart}
  </article>`;
}

async function loadReport(): Promise<Loaded> {
  let response: Response;
  try {
    response = await fetch(`/${REPORT_PATH}`, { cache: "no-store" });
  } catch {
    return { kind: "missing" };
  }
  // A dev server may answer a missing file with the app's own page.
  if (response.status === 404 || response.headers.get("content-type")?.includes("text/html")) {
    return { kind: "missing" };
  }
  if (!response.ok) {
    return { kind: "unreadable", reason: `The server answered ${response.status}.` };
  }
  try {
    return { kind: "report", report: readValidationReport(await response.text()) };
  } catch (error) {
    return { kind: "unreadable", reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The model against published data: a chart per Validation Target in the latest validation
 * report, over the Room, which goes on running underneath.
 */
export function createValidationView(container: HTMLElement, room: HTMLElement): ValidationView {
  container.innerHTML = `
    <header class="validation-header">
      <button id="validation-back" class="icon-button" type="button" aria-label="Back to the Room" title="Back to the Room">${BACK_ICON}</button>
      <h1>Validation</h1>
      <div id="validation-meta" class="validation-meta"></div>
      <div id="validation-stale" class="stale" role="status" hidden></div>
    </header>
    <div id="validation-body"></div>
    <div class="chart-tip" role="tooltip" hidden></div>`;
  const part = <T extends HTMLElement>(selector: string, type: new () => T): T => {
    const element = container.querySelector(selector);
    if (!(element instanceof type)) throw new Error(`Malformed validation view: ${selector}`);
    return element;
  };
  const back = part("#validation-back", HTMLButtonElement);
  const meta = part("#validation-meta", HTMLElement);
  const stale = part("#validation-stale", HTMLElement);
  const body = part("#validation-body", HTMLElement);
  const tooltip = part(".chart-tip", HTMLElement);

  let tips: string[] = [];
  let loads = 0;
  let returnFocus: Element | null = null;

  function message(html: string, state: string): void {
    meta.innerHTML = "";
    stale.hidden = true;
    body.innerHTML = `<div id="validation-message" class="validation-message" data-state="${state}">${html}</div>`;
  }

  function show(loaded: Loaded): void {
    tips = [];
    tooltip.hidden = true;
    if (loaded.kind === "missing") {
      message(
        `<p>No validation report yet.</p><p>Run <code>${VALIDATE_COMMAND}</code> from the repo root to make one.</p>`,
        "missing",
      );
      return;
    }
    if (loaded.kind === "unreadable") {
      message(
        `<p>The validation report can't be read. ${escapeHtml(loaded.reason)}</p><p>Run <code>${VALIDATE_COMMAND}</code> from the repo root to make a new one.</p>`,
        "unreadable",
      );
      return;
    }
    const { report } = loaded;
    const stepMilliseconds = 1000 / report.stepsPerSecond;
    meta.innerHTML = [
      `<span>Made <b id="validation-made"><time datetime="${escapeHtml(report.generatedAt)}">${escapeHtml(localTime(report.generatedAt))}</time></b></span>`,
      `<span>Model <b id="validation-model">${escapeHtml(report.modelVersion)}</b></span>`,
      `<span title="${report.stepsPerSecond} steps a second">Step <b id="validation-step">${formatNumber(stepMilliseconds)} ms</b></span>`,
      `<span title="${escapeHtml(report.seeds.join(", "))}">Seeds <b id="validation-seeds">${seedList(report.seeds)}</b></span>`,
    ].join("");
    const reason = staleness(report, MODEL_VERSION, DEFAULT_PARAMETERS);
    stale.hidden = reason === null;
    stale.textContent = reason === null ? "" : `Stale. ${reason}`;
    const targets =
      report.targets.length === 0
        ? `<div id="validation-message" class="validation-message" data-state="empty"><p>The report has no Validation Targets.</p></div>`
        : `<div class="targets">${report.targets.map((target) => targetHtml(target, tips)).join("")}</div>`;
    body.innerHTML = [
      targets,
      boutShapesHtml(report, tips, baselineExtras(report, tips)),
      disagreementHtml(report, tips),
      relationshipsHtml(report, tips),
    ].join("");
  }

  async function load(): Promise<void> {
    loads += 1;
    const thisLoad = loads;
    message("<p>Reading the validation report…</p>", "loading");
    const loaded = await loadReport();
    // A later open's load replaces this one.
    if (thisLoad === loads) show(loaded);
  }

  function placeTooltip(event: PointerEvent): void {
    const gap = 14;
    const { offsetWidth: width, offsetHeight: height } = tooltip;
    const left =
      event.clientX + gap + width > innerWidth ? event.clientX - gap - width : event.clientX + gap;
    const top =
      event.clientY + gap + height > innerHeight
        ? event.clientY - gap - height
        : event.clientY + gap;
    tooltip.style.left = `${Math.max(4, left)}px`;
    tooltip.style.top = `${Math.max(4, top)}px`;
  }

  let hovered: Element | null = null;
  body.addEventListener("pointermove", (event) => {
    const mark = event.target instanceof Element ? event.target.closest("[data-tip]") : null;
    if (mark !== hovered) {
      hovered?.classList.remove("hovered");
      hovered = mark;
      hovered?.classList.add("hovered");
      const html = mark ? tips[Number(mark.getAttribute("data-tip"))] : undefined;
      tooltip.hidden = html === undefined;
      if (html !== undefined) tooltip.innerHTML = html;
    }
    if (!tooltip.hidden) placeTooltip(event);
  });
  body.addEventListener("pointerleave", () => {
    hovered?.classList.remove("hovered");
    hovered = null;
    tooltip.hidden = true;
  });

  function close(): void {
    if (container.hidden) return;
    container.hidden = true;
    room.inert = false;
    // Leaves an address that opened the view on the Room, so reloading shows the Room.
    const url = new URL(location.href);
    if (url.searchParams.has("view")) {
      url.searchParams.delete("view");
      history.replaceState(history.state, "", url);
    }
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
  }

  body.addEventListener("click", handleScaleSwitch);
  back.addEventListener("click", close);
  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  return {
    open: () => {
      if (!container.hidden) return;
      returnFocus = document.activeElement;
      container.hidden = false;
      // The Room goes on running, but can't be reached until the view closes.
      room.inert = true;
      back.focus();
      void load();
    },
    close,
    isOpen: () => !container.hidden,
  };
}
