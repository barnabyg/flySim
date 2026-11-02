import {
  DEFAULT_LIGHT_SCHEDULE,
  DEFAULT_ROOM,
  type FloorPlace,
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
  /** Where the food starts, or undefined for the engine's default. */
  readonly food?: FloorPlace;
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

/** A place written as "x,y" in metres, if it is on the Room's floor. */
function floorPlace(parameter: string | null, room: RoomSetup): FloorPlace | undefined {
  const [x, y] = (parameter ?? "").split(",").map(numberFrom);
  if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }
  return x >= 0 && x <= room.widthMetres && y >= 0 && y <= room.depthMetres ? { x, y } : undefined;
}

export function settingsFromUrl(
  search: string,
  speeds: readonly number[],
  defaultSpeed: number,
): RunSettings {
  const parameters = new URLSearchParams(search);
  const seed = numberFrom(parameters.get("seed"));
  const speed = numberFrom(parameters.get("speed"));
  const room = {
    widthMetres: roomSize(parameters.get("width"), DEFAULT_ROOM.widthMetres),
    depthMetres: roomSize(parameters.get("depth"), DEFAULT_ROOM.depthMetres),
    heightMetres: roomSize(parameters.get("height"), DEFAULT_ROOM.heightMetres),
  };
  const food = floorPlace(parameters.get("food"), room);
  return {
    seed: Number.isInteger(seed) ? seed : randomSeed(),
    room,
    speed: speeds.includes(speed) ? speed : defaultSpeed,
    lightSchedule: {
      ...DEFAULT_LIGHT_SCHEDULE,
      lightHours: lightHours(parameters.get("lightHours")),
    },
    ...(food && { food }),
  };
}

export function urlForSettings({ seed, room, speed, lightSchedule, food }: RunSettings): string {
  const parameters = new URLSearchParams({
    seed: String(seed),
    width: String(room.widthMetres),
    depth: String(room.depthMetres),
    height: String(room.heightMetres),
    speed: String(speed),
    lightHours: String(lightSchedule.lightHours),
  });
  // A new Room size may leave a place off its floor, which then falls back to the default.
  if (food) parameters.set("food", `${food.x},${food.y}`);
  return `?${parameters.toString()}`;
}
