import { DEFAULT_ROOM, type RoomSetup } from "../engine";

const MIN_ROOM_METRES = 0.1;
const MAX_ROOM_METRES = 5;

export const ROOM_LIMITS = { min: MIN_ROOM_METRES, max: MAX_ROOM_METRES };

/** What a run starts with. The URL holds it, so a restart is a fresh page load. */
export interface RunSettings {
  readonly seed: number;
  readonly room: RoomSetup;
  readonly speed: number;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function roomSize(parameter: string | null, fallback: number): number {
  const parsed = parameter === null ? NaN : Number(parameter);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_ROOM_METRES, Math.max(MIN_ROOM_METRES, parsed));
}

export function settingsFromUrl(
  search: string,
  speeds: readonly number[],
  defaultSpeed: number,
): RunSettings {
  const parameters = new URLSearchParams(search);
  const seed = Number(parameters.get("seed") ?? NaN);
  const speed = Number(parameters.get("speed") ?? NaN);
  return {
    seed: Number.isInteger(seed) ? seed : randomSeed(),
    room: {
      widthMetres: roomSize(parameters.get("width"), DEFAULT_ROOM.widthMetres),
      depthMetres: roomSize(parameters.get("depth"), DEFAULT_ROOM.depthMetres),
      heightMetres: roomSize(parameters.get("height"), DEFAULT_ROOM.heightMetres),
    },
    speed: speeds.includes(speed) ? speed : defaultSpeed,
  };
}

export function urlForSettings({ seed, room, speed }: RunSettings): string {
  const parameters = new URLSearchParams({
    seed: String(seed),
    width: String(room.widthMetres),
    depth: String(room.depthMetres),
    height: String(room.heightMetres),
    speed: String(speed),
  });
  return `?${parameters.toString()}`;
}
