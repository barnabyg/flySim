import type { Behaviour, DriverId } from "../engine";

export const BEHAVIOUR_COLOURS: Readonly<Record<Behaviour, string>> = {
  immobility: "#4f7cac",
  grooming: "#6fbf4a",
  walking: "#e0a030",
  flying: "#d0508c",
  sleeping: "#8f78e6",
};

export const DRIVER_COLOURS: Readonly<Record<DriverId, string>> = {
  spontaneous: "#9aa1ae",
  arousal: "#3fc1a0",
  contact: "#b58cf0",
  sleepPressure: "#5b6ee1",
};

export const BEHAVIOUR_NAMES: Readonly<Record<Behaviour, string>> = {
  immobility: "Immobility",
  grooming: "Grooming",
  walking: "Walking",
  flying: "Flying",
  sleeping: "Sleeping",
};

export const DRIVER_NAMES: Readonly<Record<DriverId, string>> = {
  spontaneous: "Spontaneous",
  arousal: "Arousal",
  contact: "Surface contact",
  sleepPressure: "Sleep pressure",
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
};

export function behaviourIcon(behaviour: Behaviour): string {
  return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="color:${BEHAVIOUR_COLOURS[behaviour]}">${BEHAVIOUR_ICON_PATHS[behaviour]}</svg>`;
}
