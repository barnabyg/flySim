import type { RoomSetup } from "../engine";
import { MAX_ROOM_METRES, MIN_ROOM_METRES } from "./runSettings";

const RESTART_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5M12 1v4H8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NEW_SEED_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="5.5" cy="5.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/></svg>';
const ROOM_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 5l6-3 6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

const DISTURB_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M9.500 1L3 9h4l-1 6 7-8.500H9z" fill="currentColor"/></svg>';

export interface RunControlHandlers {
  onDisturb(): void;
  onRestart(): void;
  onNewSeed(): void;
  onRoomChange(room: RoomSetup): void;
}

function roomInput(id: string, label: string, value: number): string {
  return `<label>${label}<input id="${id}" type="number" step="0.05" min="${MIN_ROOM_METRES}" max="${MAX_ROOM_METRES}" value="${value}" /></label>`;
}

/** Starts a new run: the same one again, a different one, or one in a differently sized Room. */
export function createRunControls(
  container: HTMLElement,
  seed: number,
  room: RoomSetup,
  handlers: RunControlHandlers,
): void {
  container.innerHTML = `
    <button id="disturb" class="icon-button" type="button" aria-label="Disturb" title="Disturb">${DISTURB_ICON}</button>
    <button id="restart" class="icon-button" type="button" aria-label="Restart with the same seed" title="Restart with seed ${seed}">${RESTART_ICON}</button>
    <button id="new-seed" class="icon-button" type="button" aria-label="Restart with a new seed" title="Restart with a new seed">${NEW_SEED_ICON}</button>
    <details id="room-settings">
      <summary class="icon-button" aria-label="Room size" title="Room size">${ROOM_ICON}</summary>
      <form id="room-form">
        ${roomInput("room-width", "Width (m)", room.widthMetres)}
        ${roomInput("room-depth", "Depth (m)", room.depthMetres)}
        ${roomInput("room-height", "Height (m)", room.heightMetres)}
        <button id="room-apply" type="submit">Restart</button>
      </form>
    </details>`;

  const disturb = container.querySelector<HTMLButtonElement>("#disturb");
  const restart = container.querySelector<HTMLButtonElement>("#restart");
  const newSeed = container.querySelector<HTMLButtonElement>("#new-seed");
  const form = container.querySelector<HTMLFormElement>("#room-form");
  const width = container.querySelector<HTMLInputElement>("#room-width");
  const depth = container.querySelector<HTMLInputElement>("#room-depth");
  const height = container.querySelector<HTMLInputElement>("#room-height");
  if (!disturb || !restart || !newSeed || !form || !width || !depth || !height) {
    throw new Error("Malformed run controls");
  }

  disturb.addEventListener("click", () => {
    handlers.onDisturb();
  });
  restart.addEventListener("click", () => {
    handlers.onRestart();
  });
  newSeed.addEventListener("click", () => {
    handlers.onNewSeed();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onRoomChange({
      widthMetres: width.valueAsNumber,
      depthMetres: depth.valueAsNumber,
      heightMetres: height.valueAsNumber,
    });
  });
}
