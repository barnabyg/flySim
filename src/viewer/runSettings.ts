import {
  DEFAULT_LIGHT_SCHEDULE,
  DEFAULT_ROOM,
  SOURCE_KINDS,
  type FloorPlace,
  type SourceKind,
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
  /** Where the food and water start, where they aren't at the engine's defaults. */
  readonly sources: Partial<Readonly<Record<SourceKind, FloorPlace>>>;
  /** How full the fly's reserves start, where they aren't at the engine's defaults. */
  readonly reserves: StartingReserves;
}

/** How full the Energy and Hydration Reserves start, from just above empty to full. */
export interface StartingReserves {
  readonly energy?: number;
  readonly hydration?: number;
}

const RESERVES = ["energy", "hydration"] as const;
/** A reserve can't start empty, as the fly would be dead before the run began. */
const MIN_STARTING_RESERVE = 0.01;

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
  const sources: Partial<Record<SourceKind, FloorPlace>> = {};
  for (const kind of SOURCE_KINDS) {
    const place = floorPlace(parameters.get(kind), room);
    if (place) sources[kind] = place;
  }
  const reserves: { energy?: number; hydration?: number } = {};
  for (const reserve of RESERVES) {
    const parsed = numberFrom(parameters.get(reserve));
    if (Number.isFinite(parsed))
      reserves[reserve] = Math.min(1, Math.max(MIN_STARTING_RESERVE, parsed));
  }
  return {
    seed: Number.isInteger(seed) ? seed : randomSeed(),
    room,
    speed: speeds.includes(speed) ? speed : defaultSpeed,
    lightSchedule: {
      ...DEFAULT_LIGHT_SCHEDULE,
      lightHours: lightHours(parameters.get("lightHours")),
    },
    sources,
    reserves,
  };
}

export function urlForSettings({
  seed,
  room,
  speed,
  lightSchedule,
  sources,
  reserves,
}: RunSettings): string {
  const parameters = new URLSearchParams({
    seed: String(seed),
    width: String(room.widthMetres),
    depth: String(room.depthMetres),
    height: String(room.heightMetres),
    speed: String(speed),
    lightHours: String(lightSchedule.lightHours),
  });
  // A new Room size may leave a place off its floor, which then falls back to the default.
  for (const kind of SOURCE_KINDS) {
    const place = sources[kind];
    if (place) parameters.set(kind, `${place.x},${place.y}`);
  }
  for (const reserve of RESERVES) {
    const level = reserves[reserve];
    if (level !== undefined) parameters.set(reserve, String(level));
  }
  return `?${parameters.toString()}`;
}
