import type { Behaviour, DriverId } from "../engine";

export const BEHAVIOUR_COLOURS: Readonly<Record<Behaviour, string>> = {
  immobility: "#4f7cac",
  walking: "#e0a030",
};

export const DRIVER_COLOURS: Readonly<Record<DriverId, string>> = {
  spontaneous: "#9aa1ae",
  arousal: "#3fc1a0",
};

export const BEHAVIOUR_NAMES: Readonly<Record<Behaviour, string>> = {
  immobility: "Immobility",
  walking: "Walking",
};

export const DRIVER_NAMES: Readonly<Record<DriverId, string>> = {
  spontaneous: "Spontaneous",
  arousal: "Arousal",
};

const BEHAVIOUR_ICON_PATHS: Readonly<Record<Behaviour, string>> = {
  immobility: '<circle cx="8" cy="8" r="4.5" fill="currentColor"/>',
  walking:
    '<path d="M2 11 L6 5 L10 11 L14 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function behaviourIcon(behaviour: Behaviour): string {
  return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="color:${BEHAVIOUR_COLOURS[behaviour]}">${BEHAVIOUR_ICON_PATHS[behaviour]}</svg>`;
}
