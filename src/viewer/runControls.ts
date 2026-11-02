import { SOURCE_KINDS, type LightSchedule, type RoomSetup, type SourceKind } from "../engine";
import { MAX_ROOM_METRES, MIN_ROOM_METRES } from "./runSettings";

const RESTART_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5M12 1v4H8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NEW_SEED_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="5.5" cy="5.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/></svg>';
const ROOM_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 5l6-3 6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

const LIGHT_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.400 1.400M11.600 11.600L13 13M3 13l1.400-1.400M11.600 4.400L13 3" stroke="currentColor" stroke-width="1.500" stroke-linecap="round"/></svg>';
const DARK_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M10.500 2A6.500 6.500 0 1 0 14 11a5.500 5.500 0 0 1-3.500-9z" fill="currentColor"/></svg>';

/** Holding Disturb repeats it this often, which can keep the fly awake for a night at 1000×. */
const DISTURB_REPEAT_MILLISECONDS = 50;

const FIELDS_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 5c2-2 4 2 6 0s4-2 6 0M2 9c2-2 4 2 6 0s4-2 6 0M2 13c2-2 4 2 6 0s4-2 6 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

const SOURCE_ICONS: Readonly<Record<SourceKind, string>> = {
  food: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 8 H14 A6 6 0 0 1 2 8 Z" fill="currentColor"/><path d="M8 6 V2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  water:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.500 C10 5 13 7.500 13 10 A5 5 0 0 1 3 10 C3 7.500 6 5 8 1.500 Z" fill="currentColor"/></svg>',
};

/** What each button says it will do, given whether its source is in the Room. */
function sourceLabel(kind: SourceKind, present: boolean): string {
  return present ? `Remove the ${kind}` : `Put the ${kind} back`;
}

const DISTURB_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M9.500 1L3 9h4l-1 6 7-8.500H9z" fill="currentColor"/></svg>';

export interface RunControls {
  /** Stops the controls that change the run, once its fly has died. Restarting still works. */
  disableChanges(): void;
}

export interface RunControlHandlers {
  onDisturb(): void;
  onRestart(): void;
  onNewSeed(): void;
  onRoomChange(room: RoomSetup): void;
  onLightScheduleChange(lightSchedule: LightSchedule): void;
  onFieldsToggle(visible: boolean): void;
  onSourcePresenceChange(kind: SourceKind, present: boolean): void;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** As an <input type="time"> value, which has whole minutes. */
function clockValue(hours: number): string {
  const minutes = Math.round(hours * 60) % (24 * 60);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Hours from an <input type="time">, or NaN if it is empty. */
function hoursFrom(input: HTMLInputElement): number {
  const [hours, minutes] = input.value.split(":").map(Number);
  return hours === undefined || minutes === undefined || input.value === ""
    ? NaN
    : hours + minutes / 60;
}

function roomInput(id: string, label: string, value: number): string {
  return `<label>${label}<input id="${id}" type="number" step="0.05" min="${MIN_ROOM_METRES}" max="${MAX_ROOM_METRES}" value="${value}" /></label>`;
}

/**
 * Changes the run under way, by disturbing the fly or changing the light schedule, or starts
 * a new one: the same one again, a different one, or one in a differently sized Room.
 */
export function createRunControls(
  container: HTMLElement,
  seed: number,
  room: RoomSetup,
  lightSchedule: LightSchedule,
  handlers: RunControlHandlers,
): RunControls {
  const lightsOffHour = (lightSchedule.lightsOnHour + lightSchedule.lightHours) % 24;
  container.innerHTML = `
    <button id="disturb" class="icon-button" type="button" aria-label="Disturb" title="Disturb">${DISTURB_ICON}</button>
    <button id="restart" class="icon-button" type="button" aria-label="Restart with the same seed" title="Restart with seed ${seed}">${RESTART_ICON}</button>
    <button id="new-seed" class="icon-button" type="button" aria-label="Restart with a new seed" title="Restart with a new seed">${NEW_SEED_ICON}</button>
    <details id="room-settings" class="settings">
      <summary class="icon-button" aria-label="Room size" title="Room size">${ROOM_ICON}</summary>
      <form id="room-form" class="settings-form">
        ${roomInput("room-width", "Width (m)", room.widthMetres)}
        ${roomInput("room-depth", "Depth (m)", room.depthMetres)}
        ${roomInput("room-height", "Height (m)", room.heightMetres)}
        <button id="room-apply" type="submit">Restart</button>
      </form>
    </details>
    <details id="light-settings" class="settings">
      <summary class="icon-button" aria-label="Light schedule" title="Light schedule">${LIGHT_ICON}</summary>
      <form id="light-form" class="settings-form">
        <label>${LIGHT_ICON}<input id="lights-on" type="time" aria-label="Lights on" value="${clockValue(lightSchedule.lightsOnHour)}" required /></label>
        <label>${DARK_ICON}<input id="lights-off" type="time" aria-label="Lights off" value="${clockValue(lightsOffHour)}" required /></label>
        <div class="settings-buttons">
          <button id="always-on" class="icon-button" type="button" aria-label="Always on" title="Always on">${LIGHT_ICON}</button>
          <button id="always-off" class="icon-button" type="button" aria-label="Always off" title="Always off">${DARK_ICON}</button>
          <button id="light-apply" type="submit">Set</button>
        </div>
      </form>
    </details>
    ${SOURCE_KINDS.map(
      (kind) =>
        `<button id="${kind}-presence" class="icon-button source-presence" type="button" aria-pressed="false" aria-label="${sourceLabel(kind, true)}" title="${sourceLabel(kind, true)}">${SOURCE_ICONS[kind]}</button>`,
    ).join("")}
    <button id="fields" class="icon-button" type="button" aria-pressed="false" aria-label="Show the fields" title="Show what the fly could smell and feel">${FIELDS_ICON}</button>`;

  const disturb = container.querySelector<HTMLButtonElement>("#disturb");
  const restart = container.querySelector<HTMLButtonElement>("#restart");
  const newSeed = container.querySelector<HTMLButtonElement>("#new-seed");
  const form = container.querySelector<HTMLFormElement>("#room-form");
  const width = container.querySelector<HTMLInputElement>("#room-width");
  const depth = container.querySelector<HTMLInputElement>("#room-depth");
  const height = container.querySelector<HTMLInputElement>("#room-height");
  const lightSettings = container.querySelector<HTMLDetailsElement>("#light-settings");
  const lightForm = container.querySelector<HTMLFormElement>("#light-form");
  const lightsOnInput = container.querySelector<HTMLInputElement>("#lights-on");
  const lightsOffInput = container.querySelector<HTMLInputElement>("#lights-off");
  const alwaysOn = container.querySelector<HTMLButtonElement>("#always-on");
  const alwaysOff = container.querySelector<HTMLButtonElement>("#always-off");
  const fields = container.querySelector<HTMLButtonElement>("#fields");
  if (!disturb || !restart || !newSeed || !form || !width || !depth || !height || !fields) {
    throw new Error("Malformed run controls");
  }
  if (
    !lightSettings ||
    !lightForm ||
    !lightsOnInput ||
    !lightsOffInput ||
    !alwaysOn ||
    !alwaysOff
  ) {
    throw new Error("Malformed light controls");
  }

  function changeLight(schedule: LightSchedule): void {
    lightSettings?.removeAttribute("open");
    handlers.onLightScheduleChange(schedule);
  }

  // A press disturbs at once and holding it repeats, so the fly can be kept from sleeping.
  let repeating: ReturnType<typeof setInterval> | undefined;
  function stopRepeating(): void {
    clearInterval(repeating);
    repeating = undefined;
  }
  disturb.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    handlers.onDisturb();
    stopRepeating();
    repeating = setInterval(() => {
      handlers.onDisturb();
    }, DISTURB_REPEAT_MILLISECONDS);
  });
  for (const type of ["pointerup", "pointerleave", "pointercancel"] as const) {
    disturb.addEventListener(type, stopRepeating);
  }
  disturb.addEventListener("click", (event) => {
    // A pointer press has already disturbed, so only a keyboard's click is left to handle.
    if (event.detail === 0) handlers.onDisturb();
  });
  // Pressed while the source is out of the Room.
  for (const kind of SOURCE_KINDS) {
    const button = container.querySelector<HTMLButtonElement>(`#${kind}-presence`);
    if (!button) throw new Error(`Missing the ${kind} button`);
    button.addEventListener("click", () => {
      const present = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", String(!present));
      button.setAttribute("aria-label", sourceLabel(kind, present));
      button.title = sourceLabel(kind, present);
      handlers.onSourcePresenceChange(kind, present);
    });
  }
  fields.addEventListener("click", () => {
    const visible = fields.getAttribute("aria-pressed") !== "true";
    fields.setAttribute("aria-pressed", String(visible));
    fields.setAttribute("aria-label", visible ? "Hide the fields" : "Show the fields");
    handlers.onFieldsToggle(visible);
  });
  restart.addEventListener("click", () => {
    handlers.onRestart();
  });
  newSeed.addEventListener("click", () => {
    handlers.onNewSeed();
  });
  lightForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const on = hoursFrom(lightsOnInput);
    const off = hoursFrom(lightsOffInput);
    if (!Number.isFinite(on) || !Number.isFinite(off)) return;
    // The same time for both leaves no time with the light on.
    changeLight({ lightsOnHour: on, lightHours: (off - on + 24) % 24 });
  });
  for (const [button, lightHours] of [
    [alwaysOn, 24],
    [alwaysOff, 0],
  ] as const) {
    button.addEventListener("click", () => {
      changeLight({ lightsOnHour: hoursFrom(lightsOnInput) || 0, lightHours });
    });
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onRoomChange({
      widthMetres: width.valueAsNumber,
      depthMetres: depth.valueAsNumber,
      heightMetres: height.valueAsNumber,
    });
  });

  return {
    disableChanges: () => {
      stopRepeating();
      const changers = container.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
        "#disturb, .source-presence, #light-form input, #light-form button",
      );
      for (const control of changers) control.disabled = true;
    },
  };
}
