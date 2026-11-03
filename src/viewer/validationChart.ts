/** What every chart in the validation view is drawn with. */

/** A chart's drawing area, in its viewBox's units, which scale with its width. */
export const WIDTH = 640;
export const HEIGHT = 300;
export const MARGIN = { left: 56, right: 16, top: 14, bottom: 36 };
export const PLOT = {
  left: MARGIN.left,
  right: WIDTH - MARGIN.right,
  top: MARGIN.top,
  bottom: HEIGHT - MARGIN.bottom,
};

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** A number as it reads in a chart: whole above 100, else to three significant figures. */
export function formatNumber(value: number): string {
  return Math.abs(value) >= 100 ? String(Math.round(value)) : String(Number(value.toPrecision(3)));
}

export function withUnit(value: number, unit: string): string {
  return unit === "" ? formatNumber(value) : `${formatNumber(value)} ${escapeHtml(unit)}`;
}

/** Round ticks covering a range, and the range they cover. */
export function niceScale(
  low: number,
  high: number,
): { low: number; high: number; ticks: readonly number[] } {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return niceScale(0, 1);
  if (high - low < 1e-9) return niceScale(low - Math.max(1, Math.abs(low) * 0.1), high + 1);
  const rough = (high - low) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((each) => each * magnitude >= rough) ?? 10) * magnitude;
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let tick = start; tick <= end + step / 2; tick += step) ticks.push(Number(tick.toFixed(10)));
  return { low: start, high: end, ticks };
}

/** Builds a chart's SVG, collecting what each hoverable mark says. */
export class Chart {
  readonly parts: string[] = [];
  readonly tips: string[];
  readonly y: (value: number) => number;

  constructor(tips: string[], values: readonly number[], unit: string, includeZero: boolean) {
    this.tips = tips;
    const low = Math.min(...values, ...(includeZero ? [0] : []));
    const high = Math.max(...values, ...(includeZero ? [0] : []));
    const pad = (high - low) * 0.06;
    const scale = niceScale(includeZero && low >= 0 ? low : low - pad, high + pad);
    this.y = (value) =>
      PLOT.top + ((scale.high - value) / (scale.high - scale.low)) * (PLOT.bottom - PLOT.top);
    for (const tick of scale.ticks) {
      const y = this.y(tick).toFixed(1);
      this.parts.push(
        `<line class="grid" x1="${PLOT.left}" x2="${PLOT.right}" y1="${y}" y2="${y}"/>`,
        `<text class="tick" x="${PLOT.left - 6}" y="${y}" text-anchor="end" dominant-baseline="middle">${formatNumber(tick)}</text>`,
      );
    }
    this.parts.push(
      `<text class="axis-label" transform="translate(14 ${(PLOT.top + PLOT.bottom) / 2}) rotate(-90)" text-anchor="middle">${escapeHtml(unit)}</text>`,
    );
  }

  /** Remembers what a mark says on hover, as the attribute that points to it. */
  tip(html: string): string {
    this.tips.push(html);
    return `data-tip="${this.tips.length - 1}"`;
  }

  svg(label: string): string {
    return `<svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(label)}">${this.parts.join("")}</svg>`;
  }
}

export function tipRow(colour: string | null, label: string, value: string): string {
  const swatch = colour === null ? "" : `<span class="swatch" style="background:${colour}"></span>`;
  return `<div class="tooltip-row">${swatch}${label}<b>${value}</b></div>`;
}

export function linePath(
  values: readonly (number | null)[],
  x: (bin: number) => number,
  y: (value: number) => number,
): string {
  let path = "";
  let drawing = false;
  values.forEach((value, bin) => {
    if (value === null) {
      drawing = false;
      return;
    }
    path += `${drawing ? "L" : "M"}${x(bin).toFixed(1)},${y(value).toFixed(1)}`;
    drawing = true;
  });
  return path;
}

/**
 * Switches a card's charts between the scales its buttons offer, such as time and bouts, or
 * log–log and log–linear axes.
 */
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
