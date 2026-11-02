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

/** What is in the Room besides the fly. The fly learns of it only through its senses. */
export interface RoomContents {
  /** Whether feet at this place on this surface are touching a source. */
  touching(kind: SourceKind, position: Position, surface: Surface | null): boolean;
  /** The Odour Field here. */
  odourAt(position: Position): number;
  /** Where a source is, or null if the Room has none. */
  place(kind: SourceKind): FloorPlace | null;
}

export function createRoomContents(
  room: RoomSetup,
  places: Readonly<Record<SourceKind, FloorPlace | null>>,
  odourRangeMetres: number,
): RoomContents {
  for (const kind of SOURCE_KINDS) {
    const place = places[kind];
    if (place) validateFloorPlace(room, place);
  }

  return {
    touching: (kind, position, surface) => {
      const place = places[kind];
      return (
        place !== null &&
        surface === "floor" &&
        Math.hypot(position.x - place.x, position.y - place.y) <= SOURCE_RADIUS_METRES
      );
    },
    odourAt: (position) => odourField(places.food, odourRangeMetres, position),
    place: (kind) => places[kind],
  };
}
