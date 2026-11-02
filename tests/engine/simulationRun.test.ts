import { describe, expect, it } from "vitest";
import {
  BEHAVIOURS,
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  STEPS_PER_SECOND,
  createSimulationRun,
  type Position,
  type RoomSetup,
  type RunSample,
  type Surface,
} from "../../src/engine";
import { recordOf } from "./helpers";

/** Starts walking at once and rarely stops, so the fly covers plenty of ground. */
const WALKING_MOSTLY = {
  ...DEFAULT_PARAMETERS,
  startWalkingSpontaneousRate: 10,
  stopWalkingSpontaneousRate: 0.001,
  stopWalkingLowArousalRate: 0,
  takeOffFromImmobilitySpontaneousRate: 0,
  takeOffFromImmobilityArousalRate: 0,
  takeOffFromWalkingSpontaneousRate: 0,
  takeOffFromWalkingArousalRate: 0,
  startGroomingSpontaneousRate: 0,
  startGroomingArousalRate: 0,
  fallAsleepSleepPressureRate: 0,
  fallAsleepCircadianRate: 0,
};

const SMALL_ROOM = { widthMetres: 0.05, depthMetres: 0.03, heightMetres: 0.04 };

const NORMALS: Readonly<Record<Surface, Position>> = {
  floor: { x: 0, y: 0, z: 1 },
  ceiling: { x: 0, y: 0, z: -1 },
  "west-wall": { x: 1, y: 0, z: 0 },
  "east-wall": { x: -1, y: 0, z: 0 },
  "south-wall": { x: 0, y: 1, z: 0 },
  "north-wall": { x: 0, y: -1, z: 0 },
};

const dot = (a: Position, b: Position): number => a.x * b.x + a.y * b.y + a.z * b.z;

function isInsideRoom({ x, y, z }: Position, room: RoomSetup): boolean {
  return (
    Math.min(x, y, z) >= 0 &&
    x <= room.widthMetres &&
    y <= room.depthMetres &&
    z <= room.heightMetres
  );
}

const HALF_BODY_METRES = 0.00125;

function distanceToNearestSurface({ x, y, z }: Position, room: RoomSetup): number {
  return Math.min(x, y, z, room.widthMetres - x, room.depthMetres - y, room.heightMetres - z);
}

/** What's wrong with the fly's place on its surface. A cheap check, for use on every step. */
function surfaceProblem(sample: RunSample, room: RoomSetup): string | undefined {
  const { position, surface, up, forward } = sample;
  if (surface === null) return "not on a surface";
  const distanceFromPlane: Readonly<Record<Surface, number>> = {
    floor: position.z,
    ceiling: room.heightMetres - position.z,
    "west-wall": position.x,
    "east-wall": room.widthMetres - position.x,
    "south-wall": position.y,
    "north-wall": room.depthMetres - position.y,
  };
  if (distanceFromPlane[surface] !== 0) return `off the ${surface}`;
  if (!isInsideRoom(position, room)) return "outside the Room";
  // Its feet are towards the surface and it faces along it, whichever surface it's on.
  if (dot(up, NORMALS[surface]) !== 1) return `wrong way up on the ${surface}`;
  if (Math.abs(dot(forward, up)) > 1e-9) return "not facing along the surface";
  if (Math.abs(dot(forward, forward) - 1) > 1e-9) return "not a unit direction";
  return undefined;
}

describe("Simulation Run", () => {
  it("reproduces an identical run record from identical inputs", () => {
    expect(recordOf(42, 600)).toEqual(recordOf(42, 600));
  });

  it("gives a different run record for a different seed", () => {
    expect(recordOf(1, 600).samples).not.toEqual(recordOf(2, 600).samples);
  });

  it("advances in fixed steps of 50 Hz whatever size of advance is asked for", () => {
    const inOneGo = createSimulationRun({ room: DEFAULT_ROOM, seed: 7 });
    inOneGo.advanceSteps(5000);
    const inPieces = createSimulationRun({ room: DEFAULT_ROOM, seed: 7 });
    for (let i = 0; i < 500; i++) inPieces.advanceSteps(10);

    expect(STEPS_PER_SECOND).toBe(50);
    expect(inOneGo.current().timeSeconds).toBeCloseTo(100, 9);
    expect(inPieces.record()).toEqual(inOneGo.record());
  });

  describe("walking on the Room's surfaces", () => {
    it("stays on a Room surface, correctly oriented, through long runs with many seeds", () => {
      const visited = new Set<Surface>();
      const problems = new Set<string>();
      for (let seed = 0; seed < 10; seed++) {
        const run = createSimulationRun({ room: SMALL_ROOM, seed, parameters: WALKING_MOSTLY });
        for (let i = 0; i < 40_000; i++) {
          run.advanceSteps(1);
          const sample = run.current();
          const problem = surfaceProblem(sample, SMALL_ROOM);
          if (problem) problems.add(problem);
          if (sample.surface) visited.add(sample.surface);
        }
      }
      expect([...problems]).toEqual([]);
      expect(visited).toEqual(new Set(Object.keys(NORMALS)));
    });

    it("crosses an edge with a short move that never leaves the Room", () => {
      const run = createSimulationRun({
        room: SMALL_ROOM,
        seed: 2,
        parameters: WALKING_MOSTLY,
      });
      let previous = run.current();
      let crossings = 0;
      for (let i = 0; i < 100_000; i++) {
        run.advanceSteps(1);
        const sample = run.current();
        if (sample.surface !== previous.surface) {
          crossings += 1;
          const hop = Math.hypot(
            sample.position.x - previous.position.x,
            sample.position.y - previous.position.y,
            sample.position.z - previous.position.z,
          );
          // Round the edge from 2 mm away on one surface to 2 mm away on the other.
          expect(hop).toBeLessThan(0.0035);
        }
        previous = sample;
      }
      expect(crossings).toBeGreaterThan(10);
    });

    it("records the time spent on each surface", () => {
      const run = createSimulationRun({ room: SMALL_ROOM, seed: 4, parameters: WALKING_MOSTLY });
      const expected = new Map<Surface, number>();
      for (let i = 0; i < 20_000; i++) {
        run.advanceSteps(1);
        const { surface } = run.current();
        if (surface) expected.set(surface, (expected.get(surface) ?? 0) + 1);
      }
      const { timeOnSurfaceSeconds } = run.record();

      expect(expected.size).toBeGreaterThan(1);
      for (const surface of Object.keys(NORMALS) as Surface[]) {
        expect(timeOnSurfaceSeconds[surface]).toBeCloseTo(
          (expected.get(surface) ?? 0) / STEPS_PER_SECOND,
          9,
        );
      }
    });

    it("rejects a Room too small for the fly", () => {
      expect(() =>
        createSimulationRun({
          room: { widthMetres: 0.003, depthMetres: 1, heightMetres: 1 },
          seed: 1,
        }),
      ).toThrow(/Room/);
    });
  });

  it("changes behaviour with no input, each transition starting where the last one ended", () => {
    const { firedTransitions } = recordOf(11, 1800);

    expect(firedTransitions.length).toBeGreaterThan(4);
    firedTransitions.forEach((fired, index) => {
      const previous = firedTransitions[index - 1];
      expect(fired.to).not.toBe(fired.from);
      if (previous) expect(fired.from).toBe(previous.to);
    });
  });

  it("moves the fly only while it is walking or flying", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 5 });
    let previous = run.current();
    let moved = 0;
    let movedWhileStill = 0;
    for (let i = 0; i < 90_000; i++) {
      run.advanceSteps(1);
      const sample = run.current();
      const hasMoved = JSON.stringify(sample.position) !== JSON.stringify(previous.position);
      if (hasMoved) moved += 1;
      if (hasMoved && sample.speedMetresPerSecond === 0 && sample.behaviour !== "flying") {
        movedWhileStill += 1;
      }
      previous = sample;
    }
    expect(moved).toBeGreaterThan(0);
    expect(movedWhileStill).toBe(0);
  });

  it("reports the speed the fly is really moving at", () => {
    // An hour after lights-on is too early for sleep at the default rates.
    const parameters = { ...DEFAULT_PARAMETERS, fallAsleepSleepPressureRate: 0.1 };
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 5, parameters });
    const speedsByBehaviour = new Set<string>();
    for (let i = 0; i < 180_000; i++) {
      run.advanceSteps(1);
      const { behaviour, speedMetresPerSecond } = run.current();
      speedsByBehaviour.add(`${behaviour} ${speedMetresPerSecond}`);
    }
    // A flying fly's speed drops to 0 when it reaches a surface, just before it lands.
    expect(speedsByBehaviour).toEqual(
      new Set(["immobility 0", "grooming 0", "walking 0.02", "flying 1", "flying 0", "sleeping 0"]),
    );
  });

  describe("grooming", () => {
    it("starts and ends on its own through Transition Hazards", () => {
      const { firedTransitions } = recordOf(6, 3600);
      const started = firedTransitions.filter((fired) => fired.to === "grooming");
      const ended = firedTransitions.filter((fired) => fired.from === "grooming");

      expect(started.length).toBeGreaterThan(0);
      expect(ended.length).toBeGreaterThan(0);
      for (const fired of [...started, ...ended]) expect(fired.hazard).toBeGreaterThan(0);
    });

    it("keeps the fly in place, on its surface", () => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 6 });
      let previous = run.current();
      let groomingSteps = 0;
      let moved = 0;
      for (let i = 0; i < 100_000; i++) {
        run.advanceSteps(1);
        const sample = run.current();
        if (sample.behaviour === "grooming") {
          groomingSteps += 1;
          if (
            sample.surface === null ||
            JSON.stringify(sample.position) !== JSON.stringify(previous.position)
          ) {
            moved += 1;
          }
        }
        previous = sample;
      }
      expect(groomingSteps).toBeGreaterThan(100);
      expect(moved).toBe(0);
    });

    it("is recorded separately from Immobility", () => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 6 });
      const steps = new Map<string, number>();
      for (let i = 0; i < 90_000; i++) {
        run.advanceSteps(1);
        const { behaviour } = run.current();
        steps.set(behaviour, (steps.get(behaviour) ?? 0) + 1);
      }
      const { timeInBehaviourSeconds } = run.record();

      expect(timeInBehaviourSeconds.grooming).toBeGreaterThan(0);
      expect(timeInBehaviourSeconds.immobility).toBeGreaterThan(0);
      for (const behaviour of BEHAVIOURS) {
        expect(timeInBehaviourSeconds[behaviour]).toBeCloseTo(
          (steps.get(behaviour) ?? 0) / STEPS_PER_SECOND,
          9,
        );
      }
    });
  });

  describe("flight", () => {
    const FLYING_OFTEN = {
      ...DEFAULT_PARAMETERS,
      takeOffFromImmobilitySpontaneousRate: 0.2,
      takeOffFromWalkingSpontaneousRate: 0.2,
    };

    it.each([
      ["the default Room", DEFAULT_ROOM],
      ["a differently sized Room", { widthMetres: 0.3, depthMetres: 0.5, heightMetres: 0.2 }],
    ])("starts and ends every flight on a surface and stays inside %s", (_, room) => {
      const takeOffs = new Set<Surface>();
      const landings = new Set<Surface>();
      const problems = new Set<string>();
      for (let seed = 0; seed < 5; seed++) {
        const run = createSimulationRun({ room: room, seed, parameters: FLYING_OFTEN });
        let previous = run.current();
        for (let i = 0; i < 40_000; i++) {
          run.advanceSteps(1);
          const sample = run.current();
          if (sample.behaviour === "flying") {
            if (sample.surface !== null) problems.add("on a surface while flying");
            if (!isInsideRoom(sample.position, room)) problems.add("flew out of the Room");
            if (sample.speedMetresPerSecond === 0) {
              // On reaching a surface, it already faces the way it will stand on it.
              const reached = (Object.keys(NORMALS) as Surface[]).find(
                (surface) => dot(sample.up, NORMALS[surface]) === 1,
              );
              if (!reached) problems.add("reached a surface facing no surface");
              const problem = surfaceProblem({ ...sample, surface: reached ?? null }, room);
              if (problem) problems.add(`on arrival: ${problem}`);
            } else if (distanceToNearestSurface(sample.position, room) < HALF_BODY_METRES) {
              problems.add("in the air, too close to a surface for its body to clear it");
            }
          } else {
            const problem = surfaceProblem(sample, room);
            if (problem) problems.add(problem);
          }
          if (previous.surface && sample.behaviour === "flying") takeOffs.add(previous.surface);
          if (previous.behaviour === "flying" && sample.surface) landings.add(sample.surface);
          previous = sample;
        }
      }
      expect([...problems]).toEqual([]);
      const allSurfaces = new Set(Object.keys(NORMALS));
      expect(takeOffs).toEqual(allSurfaces);
      expect(landings).toEqual(allSurfaces);
    });

    it("flies at the speed set by its parameters, about 1 m/s by default", () => {
      const measuredSpeed = (flightSpeedMetresPerSecond: number): number => {
        const run = createSimulationRun({
          room: DEFAULT_ROOM,
          seed: 1,
          parameters: { ...FLYING_OFTEN, flightSpeedMetresPerSecond },
        });
        let previous = run.current();
        let distance = 0;
        let steps = 0;
        for (let i = 0; i < 40_000; i++) {
          run.advanceSteps(1);
          const sample = run.current();
          if (previous.speedMetresPerSecond > 0.5 && sample.speedMetresPerSecond > 0.5) {
            distance += Math.hypot(
              sample.position.x - previous.position.x,
              sample.position.y - previous.position.y,
              sample.position.z - previous.position.z,
            );
            steps += 1;
          }
          previous = sample;
        }
        expect(steps).toBeGreaterThan(100);
        return (distance / steps) * STEPS_PER_SECOND;
      };

      expect(DEFAULT_PARAMETERS.flightSpeedMetresPerSecond).toBe(1);
      expect(measuredSpeed(1)).toBeCloseTo(1, 1);
      expect(measuredSpeed(2)).toBeCloseTo(2, 1);
    });

    it("lands through a Transition Hazard that only contact with a surface can raise", () => {
      const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 8, parameters: FLYING_OFTEN });
      let flyingSteps = 0;
      let contactSteps = 0;
      let wrongHazards = 0;
      for (let i = 0; i < 40_000; i++) {
        run.advanceSteps(1);
        const sample = run.current();
        if (sample.behaviour !== "flying") continue;
        const landing = sample.transitions.find(
          (state) => state.transition === "flying-to-immobility",
        );
        const inAir = sample.speedMetresPerSecond > 0;
        if (inAir) flyingSteps += 1;
        else contactSteps += 1;
        if (inAir && landing?.hazard !== 0) wrongHazards += 1;
        if (!inAir && !(landing?.contributions.contact ?? 0)) wrongHazards += 1;
      }
      expect(flyingSteps).toBeGreaterThan(100);
      expect(contactSteps).toBeGreaterThan(0);
      expect(wrongHazards).toBe(0);
      expect(
        run.firedTransitions.filter((fired) => fired.from === "flying").length,
      ).toBeGreaterThan(5);
    });

    it("takes off with no input at default parameters", () => {
      const { firedTransitions } = recordOf(3, 3600);
      const takeOffs = firedTransitions.filter((fired) => fired.to === "flying");
      expect(takeOffs.length).toBeGreaterThan(0);
      for (const fired of takeOffs) expect(fired.hazard).toBeGreaterThan(0);
    });
  });

  it("retains only recent samples when asked, without changing the run", () => {
    const capped = createSimulationRun({ room: DEFAULT_ROOM, seed: 9, maxRecordedSamples: 100 });
    capped.advanceSeconds(1000);
    const full = createSimulationRun({ room: DEFAULT_ROOM, seed: 9 });
    full.advanceSeconds(1000);

    const kept = capped.record().samples;
    expect(kept.length).toBeLessThan(200);
    expect(kept.at(-1)).toEqual(full.record().samples.at(-1));
    expect(capped.firedTransitions).toEqual(full.firedTransitions);
  });
});
