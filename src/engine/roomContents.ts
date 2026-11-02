import type { Position, RoomSetup, Surface } from "./movement";

/** A place on the Room's floor, measured from its west and south walls. */
export interface FloorPlace {
  readonly x: number;
  readonly y: number;
}

/** What the fly can take from the floor. Both are unlimited. */
export type SourceKind = "food" | "water";

export const SOURCE_KINDS: readonly SourceKind[] = ["food", "water"];

/**
 * How far a source reaches across the floor from its centre, about the size of a dish.
 * The fly touches it whenever its feet are on the floor within this distance.
 */
export const SOURCE_RADIUS_METRES = 0.025;

/**
 * Out towards opposite corners, beyond where the fly starts, so that it has to find each
 * rather than starting beside it.
 */
export function defaultPlace(kind: SourceKind, room: RoomSetup): FloorPlace {
  return kind === "food"
    ? { x: 0.12 * room.widthMetres, y: 0.25 * room.depthMetres }
    : { x: 0.88 * room.widthMetres, y: 0.75 * room.depthMetres };
}

export function validateFloorPlace(room: RoomSetup, { x, y }: FloorPlace): void {
  if (!(x >= 0 && x <= room.widthMetres && y >= 0 && y <= room.depthMetres)) {
    throw new Error(`(${x}, ${y}) isn't on the Room's floor`);
  }
}

/**
 * A steady, simplified Odour Field around the food, with no airflow or turbulence: 1 at the
 * food's centre, falling with distance in any direction to 0 at the edge of its range. It is
 * Provisional, and depends only on where the food is, never on the fly.
 */
export function odourField(food: FloorPlace | null, rangeMetres: number, at: Position): number {
  if (!food || rangeMetres <= 0) return 0;
  const distance = Math.hypot(at.x - food.x, at.y - food.y, at.z);
  return distance >= rangeMetres ? 0 : (1 - distance / rangeMetres) ** 2;
}

/** How far each field reaches, and how humid the Room is. */
export interface FieldSettings {
  readonly odourRangeMetres: number;
  readonly humidityRangeMetres: number;
  readonly globalHumidity: number;
  readonly humidityRise: number;
}

/**
 * A steady, simplified Humidity Field: the Room's own humidity everywhere, raised around the
 * water by up to the rise at its centre, falling to nothing at the edge of its range. It is
 * Provisional, and depends only on where the water is, never on the fly.
 */
export function humidityField(
  water: FloorPlace | null,
  settings: FieldSettings,
  at: Position,
): number {
  const { humidityRangeMetres: range, globalHumidity, humidityRise } = settings;
  if (!water || range <= 0) return globalHumidity;
  const distance = Math.hypot(at.x - water.x, at.y - water.y, at.z);
  return distance >= range
    ? globalHumidity
    : globalHumidity + humidityRise * (1 - distance / range) ** 2;
}

/** What is in the Room besides the fly. The fly learns of it only through its senses. */
export interface RoomContents {
  /** Whether feet at this place on this surface are touching a source. */
  touching(kind: SourceKind, position: Position, surface: Surface | null): boolean;
  /** The Odour Field here. */
  odourAt(position: Position): number;
  /** The Humidity Field here. */
  humidityAt(position: Position): number;
  /** Where a source is, or null if the Room has none. */
  place(kind: SourceKind): FloorPlace | null;
  /** Puts a source somewhere else on the floor, taking its field with it. */
  move(kind: SourceKind, place: FloorPlace): void;
  /** Takes a source out of the Room, with its field. It keeps its place for its return. */
  remove(kind: SourceKind): void;
  /** Puts a removed source back where it was last moved to. */
  restore(kind: SourceKind): void;
}

export function createRoomContents(
  room: RoomSetup,
  initialPlaces: Readonly<Record<SourceKind, FloorPlace | null>>,
  settings: FieldSettings,
): RoomContents {
  for (const kind of SOURCE_KINDS) {
    const place = initialPlaces[kind];
    if (place) validateFloorPlace(room, place);
  }
  /** Where each source is, or was when it was removed. */
  const places = { ...initialPlaces };
  const removed = new Set<SourceKind>();
  const present = (kind: SourceKind): FloorPlace | null =>
    removed.has(kind) ? null : places[kind];

  return {
    touching: (kind, position, surface) => {
      const place = present(kind);
      return (
        place !== null &&
        surface === "floor" &&
        Math.hypot(position.x - place.x, position.y - place.y) <= SOURCE_RADIUS_METRES
      );
    },
    odourAt: (position) => odourField(present("food"), settings.odourRangeMetres, position),
    humidityAt: (position) => humidityField(present("water"), settings, position),
    place: present,
    move: (kind, place) => {
      validateFloorPlace(room, place);
      places[kind] = place;
    },
    remove: (kind) => {
      removed.add(kind);
    },
    restore: (kind) => {
      removed.delete(kind);
    },
  };
}
