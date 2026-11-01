import type { RandomStream } from "./random";

export type Surface = "floor" | "ceiling" | "west-wall" | "east-wall" | "south-wall" | "north-wall";

export const SURFACES: readonly Surface[] = [
  "floor",
  "ceiling",
  "west-wall",
  "east-wall",
  "south-wall",
  "north-wall",
];

export interface RoomSetup {
  readonly widthMetres: number;
  readonly depthMetres: number;
  readonly heightMetres: number;
}

/** A point in the Room, with z up, or a direction in the same axes. */
export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

type Axis = "x" | "y" | "z";
type Side = "min" | "max";

const AXES: readonly Axis[] = ["x", "y", "z"];

/** The axis each surface is perpendicular to, and which end of it the surface is at. */
const SURFACE_PLANES: Readonly<Record<Surface, { readonly axis: Axis; readonly side: Side }>> = {
  floor: { axis: "z", side: "min" },
  ceiling: { axis: "z", side: "max" },
  "west-wall": { axis: "x", side: "min" },
  "east-wall": { axis: "x", side: "max" },
  "south-wall": { axis: "y", side: "min" },
  "north-wall": { axis: "y", side: "max" },
};

/**
 * How close the fly's feet-on-surface point may come to a neighbouring surface. It covers
 * half the body and outstretched legs, so that no part of the fly goes through a surface.
 */
const CLEARANCE_METRES = 0.002;

function surfaceAt(axis: Axis, side: Side): Surface {
  const found = SURFACES.find((surface) => {
    const plane = SURFACE_PLANES[surface];
    return plane.axis === axis && plane.side === side;
  });
  if (!found) throw new Error(`No surface at ${side} ${axis}`);
  return found;
}

export interface MovementPose {
  readonly position: Position;
  readonly surface: Surface;
  /** The way the fly faces, a unit vector along its surface. */
  readonly forward: Position;
  /** From its feet towards its back, a unit vector out of its surface. */
  readonly up: Position;
}

/** Kinematic movement over the Room's surfaces, with no physics. */
export interface Movement {
  walk(distanceMetres: number, turnRadians: number): void;
  pose(): MovementPose;
}

export function createMovement(room: RoomSetup, random: RandomStream): Movement {
  const extents: Readonly<Record<Axis, number>> = {
    x: room.widthMetres,
    y: room.depthMetres,
    z: room.heightMetres,
  };
  for (const axis of AXES) {
    if (extents[axis] <= 2 * CLEARANCE_METRES) {
      throw new Error(`The Room is too small for the fly along ${axis}`);
    }
  }

  const position: Record<Axis, number> = {
    x: room.widthMetres * (0.25 + 0.5 * random.uniform()),
    y: room.depthMetres * (0.25 + 0.5 * random.uniform()),
    z: 0,
  };
  const startingHeading = 2 * Math.PI * random.uniform();
  const forward: Record<Axis, number> = {
    x: Math.cos(startingHeading),
    y: Math.sin(startingHeading),
    z: 0,
  };
  let surface: Surface = "floor";

  function normalSign(side: Side): number {
    return side === "min" ? 1 : -1;
  }

  function up(): Record<Axis, number> {
    const { axis, side } = SURFACE_PLANES[surface];
    const normal = { x: 0, y: 0, z: 0 };
    normal[axis] = normalSign(side);
    return normal;
  }

  function normaliseForward(): void {
    const length = Math.hypot(forward.x, forward.y, forward.z);
    for (const axis of AXES) forward[axis] /= length;
  }

  function turn(radians: number): void {
    const normal = up();
    const side = {
      x: normal.y * forward.z - normal.z * forward.y,
      y: normal.z * forward.x - normal.x * forward.z,
      z: normal.x * forward.y - normal.y * forward.x,
    };
    for (const axis of AXES) {
      forward[axis] = forward[axis] * Math.cos(radians) + side[axis] * Math.sin(radians);
    }
    normaliseForward();
  }

  /**
   * Walks over an edge. Whatever was heading into the neighbouring surface now heads
   * away from the old one, which folds the path around the edge without changing its
   * length, and the fly lands the same clearance from the edge on the other side.
   */
  function crossEdge(axis: Axis, side: Side, overshoot: number): void {
    const old = SURFACE_PLANES[surface];
    position[axis] = side === "min" ? 0 : extents[axis];
    position[old.axis] =
      old.side === "min"
        ? CLEARANCE_METRES + overshoot
        : extents[old.axis] - CLEARANCE_METRES - overshoot;
    forward[old.axis] = normalSign(old.side) * Math.abs(forward[axis]);
    forward[axis] = 0;
    normaliseForward();
    surface = surfaceAt(axis, side);
  }

  function crossAnyEdge(): boolean {
    const onAxis = SURFACE_PLANES[surface].axis;
    for (const axis of AXES) {
      if (axis === onAxis) continue;
      const below = CLEARANCE_METRES - position[axis];
      const above = position[axis] - (extents[axis] - CLEARANCE_METRES);
      if (below > 0) {
        crossEdge(axis, "min", below);
        return true;
      }
      if (above > 0) {
        crossEdge(axis, "max", above);
        return true;
      }
    }
    return false;
  }

  return {
    walk: (distanceMetres, turnRadians) => {
      turn(turnRadians);
      for (const axis of AXES) position[axis] += distanceMetres * forward[axis];
      // A single step can pass a corner, which crosses two edges in turn.
      while (crossAnyEdge());
    },
    pose: () => ({
      position: { ...position },
      surface,
      forward: { ...forward },
      up: up(),
    }),
  };
}
