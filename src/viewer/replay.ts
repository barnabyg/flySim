import type { SimulationSetup } from "../engine";

/**
 * A replay can carry far more Interventions than a URL can hold, so its setup waits in the tab's
 * session storage for the page load that starts it.
 */
const STORAGE_KEY = "flySim.replay";

interface PendingReplay {
  /** The page address the replay is for, so that it starts only on the load it was meant for. */
  readonly search: string;
  readonly setup: SimulationSetup;
}

/** Starts a replay of a setup by loading the page again at the given address. */
export function startReplay(setup: SimulationSetup, search: string): void {
  const pending: PendingReplay = { search, setup };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    throw new Error("The browser wouldn't keep the replay for the page load that starts it");
  }
  location.assign(search);
}

/** The setup of the replay this page load starts, if any. It starts only once. */
export function takeReplay(search: string): SimulationSetup | undefined {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (stored === null) return undefined;
    const pending = JSON.parse(stored) as PendingReplay;
    return pending.search === search ? pending.setup : undefined;
  } catch {
    return undefined;
  }
}
