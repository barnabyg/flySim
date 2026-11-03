import type { Behaviour, DriverId } from "../engine";

export const BEHAVIOUR_COLOURS: Readonly<Record<Behaviour, string>> = {
  immobility: "#4f7cac",
  grooming: "#6fbf4a",
  walking: "#e0a030",
  flying: "#d0508c",
  sleeping: "#8f78e6",
  feeding: "#d9603b",
  drinking: "#33b8c8",
};

/** Sleep's colour on the ribbon, from lightest to deepest sleep. */
export const SLEEP_DEPTH_COLOURS: readonly string[] = ["#b9a9f4", "#8f78e6", "#6a50c8", "#4a30a0"];

export function sleepDepthColour(depth: number): string {
  const last = SLEEP_DEPTH_COLOURS.length - 1;
  const index = Math.min(last, Math.floor(depth * SLEEP_DEPTH_COLOURS.length));
  return SLEEP_DEPTH_COLOURS[index] ?? BEHAVIOUR_COLOURS.sleeping;
}

/** The day and night parts of anything showing the Room's light. */
export const DAY_COLOUR = "#e8d98a";
export const NIGHT_COLOUR = "#2a3048";

export const DRIVER_COLOURS: Readonly<Record<DriverId, string>> = {
  spontaneous: "#9aa1ae",
  arousal: "#3fc1a0",
  contact: "#b58cf0",
  light: "#f4f1e4",
  sleepPressure: "#5b6ee1",
  circadian: "#e8d24a",
  startle: "#ff7a1a",
  hunger: "#d64f7a",
  odour: "#a6b84a",
  thirst: "#3a7fe0",
  humidity: "#8fd0f0",
};

export const BEHAVIOUR_NAMES: Readonly<Record<Behaviour, string>> = {
  immobility: "Immobility",
  grooming: "Grooming",
  walking: "Walking",
  flying: "Flying",
  sleeping: "Sleeping",
  feeding: "Feeding",
  drinking: "Drinking",
};

export const DRIVER_NAMES: Readonly<Record<DriverId, string>> = {
  spontaneous: "Spontaneous",
  arousal: "Arousal",
  contact: "Contact",
  light: "Light",
  sleepPressure: "Sleep pressure",
  circadian: "Circadian Clock",
  startle: "Startle",
  hunger: "Hunger",
  odour: "Odour",
  thirst: "Thirst",
  humidity: "Humidity",
};

const BEHAVIOUR_ICON_PATHS: Readonly<Record<Behaviour, string>> = {
  immobility: '<circle cx="8" cy="8" r="4.5" fill="currentColor"/>',
  grooming:
    '<path d="M3 13 L8 6 M13 13 L8 6 M5 3 L11 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  walking:
    '<path d="M2 11 L6 5 L10 11 L14 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  flying:
    '<path d="M8 12 C5 4 2 5 1 7 M8 12 C11 4 14 5 15 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  sleeping:
    '<path d="M10.500 2 A6.500 6.500 0 1 0 14 11 A5.500 5.500 0 0 1 10.500 2 Z" fill="currentColor"/>',
  feeding:
    '<path d="M2 8 H14 A6 6 0 0 1 2 8 Z" fill="currentColor"/><path d="M8 6 V2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  drinking:
    '<path d="M8 1.500 C10 5 13 7.500 13 10 A5 5 0 0 1 3 10 C3 7.500 6 5 8 1.500 Z" fill="currentColor"/>',
};

export function behaviourIcon(behaviour: Behaviour): string {
  return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="color:${BEHAVIOUR_COLOURS[behaviour]}">${BEHAVIOUR_ICON_PATHS[behaviour]}</svg>`;
}

/** The validation view's colours: published data, the model, and whether it meets a target. */
export const VALIDATION_COLOURS = {
  published: DAY_COLOUR,
  model: "#3fc1a0",
  accepted: "#d7dbe2",
  /** The fitted descriptive baseline, which is neither published data nor the model. */
  baseline: "#e07ab8",
  pass: "#6fbf4a",
  fail: "#ff2b2b",
} as const;
