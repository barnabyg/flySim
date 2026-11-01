import {
  DRIVERS,
  TRANSITIONS,
  type DriverId,
  type FiredTransition,
  type RunSample,
  type TransitionId,
  type TransitionState,
} from "../engine";
import { BEHAVIOUR_NAMES, DRIVER_COLOURS, DRIVER_NAMES, behaviourIcon } from "./palette";

/** Bars use a log scale, as hazards span about three orders of magnitude. */
const BAR_MINIMUM_HAZARD = 0.001;
const BAR_MAXIMUM_HAZARD = 1;
const FLASH_MILLISECONDS = 700;

function barFraction(hazard: number): number {
  const fraction =
    Math.log(hazard / BAR_MINIMUM_HAZARD) / Math.log(BAR_MAXIMUM_HAZARD / BAR_MINIMUM_HAZARD);
  return Math.min(1, Math.max(0, fraction));
}

interface TransitionRow {
  readonly element: HTMLElement;
  readonly segments: Readonly<Record<DriverId, HTMLElement>>;
  readonly strip: HTMLElement;
  readonly flash: HTMLElement;
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

  const createSegment = (driver: DriverId): HTMLElement => {
    const segment = document.createElement("div");
    segment.className = "segment";
    segment.dataset["driver"] = driver;
    segment.style.background = DRIVER_COLOURS[driver];
    bar.append(segment);
    return segment;
  };

  return {
    element,
    segments: {
      spontaneous: createSegment("spontaneous"),
      arousal: createSegment("arousal"),
    },
    strip,
    flash,
  };
}

function tooltipHtml(state: TransitionState | undefined): string {
  if (!state) return `<div class="tooltip-row">—</div>`;
  const drivers = DRIVERS.map(
    (driver) =>
      `<div class="tooltip-row"><span class="swatch" style="background:${DRIVER_COLOURS[driver]}"></span>${DRIVER_NAMES[driver]}<b>${state.contributions[driver].toFixed(4)}/s</b></div>`,
  ).join("");
  return `${drivers}
    <div class="tooltip-row">Total<b>${state.hazard.toFixed(4)}/s</b></div>
    <div class="tooltip-row"><span class="swatch" style="background:var(--red)"></span>Next minute<b>${(state.fireProbabilityNextMinute * 100).toFixed(1)}%</b></div>`;
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
      for (const [id, row] of rows) {
        const state = sample.transitions.find((item) => item.transition === id);
        row.element.dataset["available"] = String(state !== undefined);
        const total = state ? barFraction(state.hazard) : 0;
        for (const driver of DRIVERS) {
          const share = state ? state.contributions[driver] / state.hazard : 0;
          row.segments[driver].style.width = `${100 * total * share}%`;
        }
        row.strip.style.opacity = String(state?.fireProbabilityNextMinute ?? 0);
      }
      fired.forEach(showFiring);
      renderTooltip();
    },
  };
}
