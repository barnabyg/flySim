import { cos, hypot, sin } from "./exactMath";
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
  /** Where its feet meet the surface it is on, or are in the air in flight. */
  readonly position: Position;
  /** The surface it stands on, or null from take-off until it lands. */
  readonly surface: Surface | null;
  /** The way the fly faces, a unit vector along its surface, or level in flight. */
  readonly forward: Position;
  /** From its feet towards its back, a unit vector out of its surface, or straight up in flight. */
  readonly up: Position;
}

/** Kinematic movement over the Room's surfaces and between them, with no physics. */
export interface Movement {
  walk(distanceMetres: number, turnRadians: number): void;
  /** Plans a flight from the current surface to a random place on any surface. */
  takeOff(): void;
  fly(distanceMetres: number): void;
  /** Whether a flight has reached the surface it was heading for. */
  hasArrived(): boolean;
  land(): void;
  /** Drops straight to the floor below, from wherever it is, and stays there. */
  fall(): void;
  /** The surface it stands on, or null in flight. Cheaper than a whole pose. */
  surface(): Surface | null;
  pose(): MovementPose;
}

interface Flight {
  readonly target: Surface;
  /** A polyline along the path. Every point is inside the Room, so every point between is too. */
  readonly points: readonly Readonly<Record<Axis, number>>[];
  /** Distance along the path to each point. */
  readonly distances: readonly number[];
  segment: number;
  travelled: number;
  arrived: boolean;
}

const FLIGHT_WAYPOINTS = 2;
const FLIGHT_PATH_SEGMENTS = 64;
/** How far along a surface's normal a flight's path heads off from it, as a share of the Room. */
const FLIGHT_PULL_OFF = 0.25;
/** Below this steepness the body follows the direction of flight. It stays level above it. */
const MIN_LEVEL_SHARE_OF_FLIGHT = 0.2;

/** A Bézier curve stays inside its control points' hull, and so inside the Room. */
function bezierPoint(
  controls: readonly Readonly<Record<Axis, number>>[],
  along: number,
): Record<Axis, number> {
  let level = controls.map((control) => ({ ...control }));
  while (level.length > 1) {
    level = level.slice(1).map((next, index) => {
      const point = level[index];
      if (!point) throw new Error("missing control point");
      return {
        x: (1 - along) * point.x + along * next.x,
        y: (1 - along) * point.y + along * next.y,
        z: (1 - along) * point.z + along * next.z,
      };
    });
  }
  const [result] = level;
  if (!result) throw new Error("a curve needs control points");
  return result;
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
    x: cos(startingHeading),
    y: sin(startingHeading),
    z: 0,
  };
  let surface: Surface = "floor";
  let flight: Flight | undefined;

  function normalSign(side: Side): number {
    return side === "min" ? 1 : -1;
  }

  function normalOf(of: Surface): Record<Axis, number> {
    const { axis, side } = SURFACE_PLANES[of];
    const normal = { x: 0, y: 0, z: 0 };
    normal[axis] = normalSign(side);
    return normal;
  }

  function up(): Record<Axis, number> {
    return flight && !flight.arrived ? { x: 0, y: 0, z: 1 } : normalOf(surface);
  }

  function normaliseForward(): void {
    const length = hypot(forward.x, forward.y, forward.z);
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
      forward[axis] = forward[axis] * cos(radians) + side[axis] * sin(radians);
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

  function randomInRoom(): Record<Axis, number> {
    const within = (axis: Axis): number =>
      CLEARANCE_METRES + random.uniform() * (extents[axis] - 2 * CLEARANCE_METRES);
    return { x: within("x"), y: within("y"), z: within("z") };
  }

  function chooseLandingSurface(): Surface {
    const area = (of: Surface): number => {
      const onAxis = SURFACE_PLANES[of].axis;
      return AXES.reduce(
        (product, axis) => (axis === onAxis ? product : product * extents[axis]),
        1,
      );
    };
    let remaining = random.uniform() * SURFACES.reduce((sum, each) => sum + area(each), 0);
    for (const each of SURFACES) {
      remaining -= area(each);
      if (remaining <= 0) return each;
    }
    return "floor";
  }

  /** A point just off a surface, along its normal, that a path heads through to leave or reach it. */
  function pullOff(from: Readonly<Record<Axis, number>>, of: Surface): Record<Axis, number> {
    const normal = normalOf(of);
    const distance = FLIGHT_PULL_OFF * extents[SURFACE_PLANES[of].axis];
    return {
      x: from.x + distance * normal.x,
      y: from.y + distance * normal.y,
      z: from.z + distance * normal.z,
    };
  }

  function planFlight(): Flight {
    const target = chooseLandingSurface();
    const end = randomInRoom();
    const { axis, side } = SURFACE_PLANES[target];
    end[axis] = side === "min" ? 0 : extents[axis];
    const waypoints = Array.from({ length: FLIGHT_WAYPOINTS }, randomInRoom);
    const controls = [
      { ...position },
      pullOff(position, surface),
      ...waypoints,
      pullOff(end, target),
      end,
    ];

    const points = Array.from({ length: FLIGHT_PATH_SEGMENTS + 1 }, (_, index) =>
      bezierPoint(controls, index / FLIGHT_PATH_SEGMENTS),
    );
    const distances = [0];
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      if (!a || !b) throw new Error("missing path point");
      distances.push((distances[i - 1] ?? 0) + hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    return { target, points, distances, segment: 0, travelled: 0, arrived: false };
  }

  /** Keeps the body level, turning it to the direction of flight unless that's nearly vertical. */
  function faceAlong(
    from: Readonly<Record<Axis, number>>,
    to: Readonly<Record<Axis, number>>,
  ): void {
    const [dx, dy, dz] = [to.x - from.x, to.y - from.y, to.z - from.z];
    const level = hypot(dx, dy);
    if (level > MIN_LEVEL_SHARE_OF_FLIGHT * hypot(level, dz)) {
      forward.x = dx / level;
      forward.y = dy / level;
    }
  }

  /**
   * Takes up the attitude for standing on the surface it has reached. This happens on
   * arrival rather than on landing, so that a level body never reaches into the surface.
   */
  function arrive(at: Flight): void {
    const end = at.points.at(-1);
    if (!end) throw new Error("missing path point");
    for (const axis of AXES) position[axis] = end[axis];
    at.arrived = true;
    surface = at.target;
    const onAxis = SURFACE_PLANES[surface].axis;
    forward[onAxis] = 0;
    if (hypot(forward.x, forward.y, forward.z) < 0.01) {
      forward[onAxis === "x" ? "y" : "x"] = 1;
    }
    normaliseForward();
  }

  return {
    takeOff: () => {
      flight = planFlight();
      // A fly facing straight up or down a wall levels out by facing into the Room.
      if (hypot(forward.x, forward.y) < 0.01) {
        const normal = normalOf(surface);
        forward.x = normal.x;
        forward.y = normal.y;
      }
      forward.z = 0;
      normaliseForward();
    },
    fly: (distanceMetres) => {
      if (!flight) throw new Error("The fly isn't flying");
      if (flight.arrived) return;
      flight.travelled += distanceMetres;
      const { points, distances } = flight;
      // Stopping short keeps the body clear of the surface right up to arrival.
      if (flight.travelled >= (distances.at(-1) ?? 0) - CLEARANCE_METRES) {
        arrive(flight);
        return;
      }
      while (
        flight.segment < points.length - 2 &&
        flight.travelled >= (distances[flight.segment + 1] ?? Infinity)
      ) {
        flight.segment += 1;
      }
      const start = points[flight.segment];
      const end = points[flight.segment + 1];
      const startDistance = distances[flight.segment];
      const endDistance = distances[flight.segment + 1];
      if (!start || !end || startDistance === undefined || endDistance === undefined) {
        throw new Error("missing path point");
      }
      faceAlong(start, end);
      const along = (flight.travelled - startDistance) / (endDistance - startDistance);
      for (const axis of AXES) {
        const value = start[axis] + along * (end[axis] - start[axis]);
        position[axis] = Math.min(extents[axis], Math.max(0, value));
      }
    },
    hasArrived: () => flight?.arrived ?? false,
    fall: () => {
      flight = undefined;
      surface = "floor";
      position.z = 0;
      for (const axis of ["x", "y"] as const) {
        position[axis] = Math.min(
          extents[axis] - CLEARANCE_METRES,
          Math.max(CLEARANCE_METRES, position[axis]),
        );
      }
      forward.z = 0;
      if (hypot(forward.x, forward.y) < 0.01) forward.x = 1;
      normaliseForward();
    },
    land: () => {
      flight = undefined;
    },
    walk: (distanceMetres, turnRadians) => {
      turn(turnRadians);
      for (const axis of AXES) position[axis] += distanceMetres * forward[axis];
      // A single step can pass a corner, which crosses two edges in turn.
      while (crossAnyEdge());
    },
    surface: () => (flight ? null : surface),
    pose: () => ({
      position: { ...position },
      surface: flight ? null : surface,
      forward: { ...forward },
      up: up(),
    }),
  };
}
