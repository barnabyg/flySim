import {
  DRIVERS,
  TRANSITIONS,
  type DriverId,
  type FiredTransition,
  type RunSample,
  type TransitionId,
  type TransitionState,
} from "../engine";
import {
  BEHAVIOUR_NAMES,
  DRIVER_COLOURS,
  DRIVER_NAMES,
  behaviourIcon,
  sleepDepthColour,
} from "./palette";

/**
 * The hazard, per second, that fills a bar. Bars are linear, so a segment's length
 * measures that Driver's contribution directly, and a constant Driver stays constant.
 */
const BAR_FULL_HAZARD = 0.3;
/** Sleep's transitions run far slower than the rest, and would barely show on the same scale. */
const SLEEP_BAR_FULL_HAZARDS: Partial<Readonly<Record<TransitionId, number>>> = {
  "immobility-to-sleeping": 0.03,
  "sleeping-to-immobility": 0.005,
};
const FLASH_MILLISECONDS = 700;
/**
 * A startle lasts only a moment at high speed, so its segment holds its peak this long,
 * as a flash does, before fading. Only the segment holds: the red strip stays on the hazard.
 */
const STARTLE_HOLD_MILLISECONDS = 700;
const STARTLE_FADE_MILLISECONDS = 500;

interface TransitionRow {
  readonly element: HTMLElement;
  /** The hazard, per second, that fills this row's bar. */
  readonly fullHazard: number;
  readonly segments: ReadonlyMap<DriverId, HTMLElement>;
  readonly strip: HTMLElement;
  readonly flash: HTMLElement;
  /** The strongest startle contribution still being held, and when it was reached. */
  heldStartle: { contribution: number; atMilliseconds: number };
}

export interface FlashedTransition {
  readonly step: number;
  readonly transition: TransitionId;
}

export interface DriverPanel {
  update(sample: RunSample, fired: readonly FiredTransition[]): void;
  /** Every flash shown so far, oldest first. */
  readonly flashes: readonly FlashedTransition[];
}

function createRow(id: TransitionId): TransitionRow {
  const definition = TRANSITIONS.find((item) => item.id === id);
  if (!definition) throw new Error(`Unknown transition: ${id}`);

  const element = document.createElement("div");
  element.className = "transition";
  element.dataset["transition"] = id;
  const fullHazard = SLEEP_BAR_FULL_HAZARDS[id] ?? BAR_FULL_HAZARD;
  element.dataset["fullHazard"] = String(fullHazard);
  element.setAttribute(
    "aria-label",
    `${BEHAVIOUR_NAMES[definition.from]} to ${BEHAVIOUR_NAMES[definition.to]}`,
  );
  element.innerHTML = `
    <div class="transition-icons">${behaviourIcon(definition.from)}<span class="arrow">→</span>${behaviourIcon(definition.to)}</div>
    <div class="transition-meters">
      <div class="bar"></div>
      <div class="strip-track"><div class="strip"></div></div>
    </div>
    <div class="flash"></div>`;

  const bar = element.querySelector<HTMLElement>(".bar");
  const strip = element.querySelector<HTMLElement>(".strip");
  const flash = element.querySelector<HTMLElement>(".flash");
  if (!bar || !strip || !flash) throw new Error("Malformed transition row");

  const segments = new Map(
    DRIVERS.map((driver) => {
      const segment = document.createElement("div");
      segment.className = "segment";
      segment.dataset["driver"] = driver;
      segment.style.background = DRIVER_COLOURS[driver];
      bar.append(segment);
      return [driver, segment];
    }),
  );

  return {
    element,
    fullHazard,
    segments,
    strip,
    flash,
    heldStartle: { contribution: 0, atMilliseconds: 0 },
  };
}

function heldValue(row: TransitionRow, nowMilliseconds: number): number {
  const { contribution, atMilliseconds } = row.heldStartle;
  const fading = nowMilliseconds - atMilliseconds - STARTLE_HOLD_MILLISECONDS;
  return contribution * Math.min(1, Math.max(0, 1 - fading / STARTLE_FADE_MILLISECONDS));
}

/** Raises what a row is holding, if this contribution is stronger than what's left of it. */
function holdStartle(row: TransitionRow, contribution: number, nowMilliseconds: number): void {
  if (contribution > 0 && contribution >= heldValue(row, nowMilliseconds)) {
    row.heldStartle = { contribution, atMilliseconds: nowMilliseconds };
  }
}

/** In significant figures, as sleep's hazards are thousands of times below a startle's. */
function perSecond(rate: number): string {
  return `${rate.toPrecision(3)}/s`;
}

function tooltipHtml(state: TransitionState | undefined, sleepDepth: number | null): string {
  if (!state) return `<div class="tooltip-row">—</div>`;
  const drivers = DRIVERS.map(
    (driver) =>
      `<div class="tooltip-row"><span class="swatch" style="background:${DRIVER_COLOURS[driver]}"></span>${DRIVER_NAMES[driver]}<b>${perSecond(state.contributions[driver])}</b></div>`,
  ).join("");
  return `${drivers}
    <div class="tooltip-row">Total<b>${perSecond(state.hazard)}</b></div>
    <div class="tooltip-row"><span class="swatch" style="background:var(--red)"></span>Next minute<b>${(state.fireProbabilityNextMinute * 100).toFixed(1)}%</b></div>${
      sleepDepth === null
        ? ""
        : `<div class="tooltip-row"><span class="swatch" style="background:${sleepDepthColour(sleepDepth)}"></span>Sleep Depth<b>${sleepDepth.toFixed(2)}</b></div>`
    }`;
}

/** Shows why the fly might act: a bar per transition, its red strip and its firing flash. */
export function createDriverPanel(container: HTMLElement): DriverPanel {
  const rows = new Map<TransitionId, TransitionRow>();
  for (const { id } of TRANSITIONS) {
    const row = createRow(id);
    rows.set(id, row);
    container.append(row.element);
  }

  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.hidden = true;
  container.append(tooltip);

  const flashes: FlashedTransition[] = [];
  let hovered: TransitionId | undefined;
  let latest: RunSample | undefined;

  function renderTooltip(): void {
    tooltip.hidden = hovered === undefined;
    if (hovered === undefined) return;
    const row = rows.get(hovered);
    if (row) tooltip.style.top = `${row.element.offsetTop + row.element.offsetHeight + 4}px`;
    tooltip.innerHTML = tooltipHtml(
      latest?.transitions.find((state) => state.transition === hovered),
      latest?.sleepDepth ?? null,
    );
  }

  for (const [id, row] of rows) {
    row.element.addEventListener("pointerenter", () => {
      hovered = id;
      renderTooltip();
    });
    row.element.addEventListener("pointerleave", () => {
      hovered = undefined;
      renderTooltip();
    });
  }

  function showFiring(fired: FiredTransition): void {
    flashes.push({ step: fired.step, transition: fired.transition });
    const row = rows.get(fired.transition);
    if (!row) return;
    const timing = { duration: FLASH_MILLISECONDS, easing: "ease-out" };
    row.flash.animate([{ opacity: 1 }, { opacity: 0 }], timing);
    // Holds the strip at its value when the transition fired, so that a firing at
    // low intensity can be seen, even though this transition is no longer available.
    row.strip.animate([{ opacity: fired.fireProbabilityNextMinute }, { opacity: 0 }], timing);
  }

  return {
    flashes,
    update: (sample, fired) => {
      latest = sample;
      const now = performance.now();
      // A firing ends its row's availability, so this is the last it will see of the startle.
      for (const { transition, contributions } of fired) {
        const row = rows.get(transition);
        if (row) holdStartle(row, contributions.startle, now);
      }
      for (const [id, row] of rows) {
        const state = sample.transitions.find((item) => item.transition === id);
        row.element.dataset["available"] = String(state !== undefined);
        for (const driver of DRIVERS) {
          let contribution = state?.contributions[driver] ?? 0;
          if (driver === "startle") {
            holdStartle(row, contribution, now);
            contribution = Math.max(contribution, heldValue(row, now));
          }
          const segment = row.segments.get(driver);
          // On every row's own scale, a startle would peg the sleep rows' bars at any depth.
          const full = driver === "startle" ? BAR_FULL_HAZARD : row.fullHazard;
          if (segment) segment.style.width = `${(100 * contribution) / full}%`;
        }
        row.strip.style.opacity = String(state?.fireProbabilityNextMinute ?? 0);
      }
      fired.forEach(showFiring);
      renderTooltip();
    },
  };
}
