import type { Position, RoomSetup, Surface } from "./movement";

/** A place on the Room's floor, measured from its west and south walls. */
export interface FloorPlace {
  readonly x: number;
  readonly y: number;
}

/** Something on the floor the fly can take from. Food is unlimited. */
export interface SourceState {
  readonly place: FloorPlace;
}

/**
 * How far the food reaches across the floor from its centre, about the size of a dish.
 * The fly touches it whenever its feet are on the floor within this distance.
 */
export const SOURCE_RADIUS_METRES = 0.025;

/** Away from the middle, so that a fly starting near the middle has to find it. */
export function defaultFoodPlace(room: RoomSetup): FloorPlace {
  return { x: 0.3 * room.widthMetres, y: 0.5 * room.depthMetres };
}

export function validateFloorPlace(room: RoomSetup, { x, y }: FloorPlace): void {
  if (!(x >= 0 && x <= room.widthMetres && y >= 0 && y <= room.depthMetres)) {
    throw new Error(`(${x}, ${y}) isn't on the Room's floor`);
  }
}

/** What is in the Room besides the fly. The fly learns of it only through its senses. */
export interface RoomContents {
  /** Whether feet at this place on this surface are touching the food. */
  touchingFood(position: Position, surface: Surface | null): boolean;
  food(): SourceState;
}

export function createRoomContents(room: RoomSetup, foodPlace: FloorPlace): RoomContents {
  validateFloorPlace(room, foodPlace);
  const food = { place: foodPlace };

  return {
    touchingFood: (position, surface) =>
      surface === "floor" &&
      Math.hypot(position.x - food.place.x, position.y - food.place.y) <= SOURCE_RADIUS_METRES,
    food: () => ({ ...food }),
  };
}
