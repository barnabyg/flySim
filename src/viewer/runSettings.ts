import {
  DEFAULT_LIGHT_SCHEDULE,
  DEFAULT_ROOM,
  type LightSchedule,
  type RoomSetup,
} from "../engine";

export const MIN_ROOM_METRES = 0.1;
export const MAX_ROOM_METRES = 5;

/** What a run starts with. The URL holds it, so a restart is a fresh page load. */
export interface RunSettings {
  readonly seed: number;
  readonly room: RoomSetup;
  readonly speed: number;
  readonly lightSchedule: LightSchedule;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** NaN when absent, as Number(null) would otherwise read as 0. */
function numberFrom(parameter: string | null): number {
  return parameter === null ? NaN : Number(parameter);
}

function roomSize(parameter: string | null, fallback: number): number {
  const parsed = numberFrom(parameter);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_ROOM_METRES, Math.max(MIN_ROOM_METRES, parsed));
}

function lightHours(parameter: string | null): number {
  const parsed = numberFrom(parameter);
  if (!Number.isFinite(parsed)) return DEFAULT_LIGHT_SCHEDULE.lightHours;
  return Math.min(24, Math.max(0, parsed));
}

export function settingsFromUrl(
  search: string,
  speeds: readonly number[],
  defaultSpeed: number,
): RunSettings {
  const parameters = new URLSearchParams(search);
  const seed = numberFrom(parameters.get("seed"));
  const speed = numberFrom(parameters.get("speed"));
  return {
    seed: Number.isInteger(seed) ? seed : randomSeed(),
    room: {
      widthMetres: roomSize(parameters.get("width"), DEFAULT_ROOM.widthMetres),
      depthMetres: roomSize(parameters.get("depth"), DEFAULT_ROOM.depthMetres),
      heightMetres: roomSize(parameters.get("height"), DEFAULT_ROOM.heightMetres),
    },
    speed: speeds.includes(speed) ? speed : defaultSpeed,
    lightSchedule: {
      ...DEFAULT_LIGHT_SCHEDULE,
      lightHours: lightHours(parameters.get("lightHours")),
    },
  };
}

export function urlForSettings({ seed, room, speed, lightSchedule }: RunSettings): string {
  const parameters = new URLSearchParams({
    seed: String(seed),
    width: String(room.widthMetres),
    depth: String(room.depthMetres),
    height: String(room.heightMetres),
    speed: String(speed),
    lightHours: String(lightSchedule.lightHours),
  });
  return `?${parameters.toString()}`;
}
