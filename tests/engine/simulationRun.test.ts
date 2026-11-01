import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  STEPS_PER_SECOND,
  createSimulationRun,
  type Position,
  type RoomSetup,
  type RunRecord,
  type RunSample,
  type Surface,
} from "../../src/engine";

/** Starts walking at once and rarely stops, so the fly covers plenty of ground. */
const WALKING_MOSTLY = {
  ...DEFAULT_PARAMETERS,
  startWalkingSpontaneousRate: 10,
  stopWalkingSpontaneousRate: 0.001,
  stopWalkingLowArousalRate: 0,
};

function recordOf(seed: number, simulatedSeconds: number): RunRecord {
  const run = createSimulationRun({ room: DEFAULT_ROOM, seed });
  run.advanceSeconds(simulatedSeconds);
  return run.record();
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

    /** What's wrong with the fly's place on its surface. A cheap check, for use on every step. */
    function surfaceProblem(sample: RunSample, room: RoomSetup): string | undefined {
      const { position, surface, up, forward } = sample;
      const distanceFromPlane: Readonly<Record<Surface, number>> = {
        floor: position.z,
        ceiling: room.heightMetres - position.z,
        "west-wall": position.x,
        "east-wall": room.widthMetres - position.x,
        "south-wall": position.y,
        "north-wall": room.depthMetres - position.y,
      };
      if (distanceFromPlane[surface] !== 0) return `off the ${surface}`;
      if (
        Math.min(position.x, position.y, position.z) < 0 ||
        position.x > room.widthMetres ||
        position.y > room.depthMetres ||
        position.z > room.heightMetres
      ) {
        return "outside the Room";
      }
      // Its feet are towards the surface and it faces along it, whichever surface it's on.
      const normal = NORMALS[surface];
      if (dot(up, normal) !== 1) return `wrong way up on the ${surface}`;
      if (Math.abs(dot(forward, up)) > 1e-9) return "not facing along the surface";
      if (Math.abs(dot(forward, forward) - 1) > 1e-9) return "not a unit direction";
      return undefined;
    }

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
          visited.add(sample.surface);
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
        expected.set(surface, (expected.get(surface) ?? 0) + 1);
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

  it("alternates between Immobility and walking with no input", () => {
    const { firedTransitions } = recordOf(11, 1800);

    expect(firedTransitions.length).toBeGreaterThan(4);
    firedTransitions.forEach((fired, index) => {
      const previous = firedTransitions[index - 1];
      expect(fired.to).not.toBe(fired.from);
      if (previous) expect(fired.from).toBe(previous.to);
    });
  });

  it("moves the fly only while it is walking", () => {
    const { samples } = recordOf(5, 1800);
    let walkedDistance = 0;

    for (let i = 1; i < samples.length; i++) {
      const before = samples[i - 1];
      const after = samples[i];
      if (!before || !after) throw new Error("missing sample");
      const distance = Math.hypot(
        after.position.x - before.position.x,
        after.position.y - before.position.y,
      );
      if (before.behaviour === "immobility" && after.behaviour === "immobility") {
        expect(distance).toBe(0);
      }
      if (before.behaviour === "walking" && after.behaviour === "walking") {
        walkedDistance += distance;
      }
    }
    expect(walkedDistance).toBeGreaterThan(0);
  });

  it("reports the walking speed only while the fly is walking", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 5 });
    const speedsByBehaviour = new Set<string>();
    for (let i = 0; i < 60_000; i++) {
      run.advanceSteps(1);
      const { behaviour, speedMetresPerSecond } = run.current();
      speedsByBehaviour.add(`${behaviour} ${speedMetresPerSecond}`);
    }
    expect(speedsByBehaviour).toEqual(new Set(["immobility 0", "walking 0.02"]));
  });

  it("gives the same hazard at the same arousal however long the bout has lasted", () => {
    const { samples, firedTransitions } = recordOf(23, 7200);
    const timeInBout = (timeSeconds: number): number => {
      const started = firedTransitions.findLast((fired) => fired.timeSeconds <= timeSeconds);
      return timeSeconds - (started?.timeSeconds ?? 0);
    };
    const immobile = samples
      .filter((sample) => sample.behaviour === "immobility")
      .map((sample) => ({
        arousal: sample.arousal,
        hazard: sample.transitions[0]?.hazard ?? NaN,
        timeInBout: timeInBout(sample.timeSeconds),
      }))
      .sort((a, b) => a.arousal - b.arousal);

    // Neighbours in arousal should agree on hazard. Where their time in the bout
    // differs a lot, any direct dependence on it would show up as a gap.
    let comparisons = 0;
    for (let i = 1; i < immobile.length; i++) {
      const a = immobile[i - 1];
      const b = immobile[i];
      if (!a || !b) throw new Error("missing sample");
      if (Math.abs(a.timeInBout - b.timeInBout) > 30) {
        comparisons += 1;
        expect(Math.abs(a.hazard - b.hazard)).toBeLessThan(0.001);
      }
    }
    expect(comparisons).toBeGreaterThan(50);
  });

  it("draws Trigger Levels from an exponential distribution with mean 1", () => {
    const levels = Array.from({ length: 20 }, (_, seed) => recordOf(seed, 7200))
      .flatMap((record) => record.firedTransitions)
      .map((fired) => fired.triggerLevel);
    const mean = levels.reduce((sum, level) => sum + level, 0) / levels.length;
    const shareBelowOne = levels.filter((level) => level < 1).length / levels.length;

    expect(levels.length).toBeGreaterThan(500);
    expect(mean).toBeGreaterThan(0.9);
    expect(mean).toBeLessThan(1.1);
    // For an exponential with mean 1, P(level < 1) = 1 - 1/e = 0.632.
    expect(shareBelowOne).toBeGreaterThan(0.58);
    expect(shareBelowOne).toBeLessThan(0.68);
  });

  it("fires a transition when its accumulated hazard reaches the Trigger Level", () => {
    const { samples, firedTransitions } = recordOf(31, 7200);

    // Integrate the once-a-second hazard over each bout that's long enough for
    // the integral to be accurate, and compare it with the Trigger Level.
    let checked = 0;
    let boutStart = 0;
    for (const fired of firedTransitions) {
      const inBout = samples.filter(
        (sample) => sample.timeSeconds > boutStart && sample.timeSeconds <= fired.timeSeconds,
      );
      if (inBout.length >= 20) {
        const accumulated = inBout.reduce(
          (sum, sample) => sum + (sample.transitions[0]?.hazard ?? 0),
          0,
        );
        expect(Math.abs(accumulated - fired.triggerLevel)).toBeLessThan(
          0.1 * fired.triggerLevel + 0.05,
        );
        checked += 1;
      }
      boutStart = fired.timeSeconds;
    }
    expect(checked).toBeGreaterThan(10);
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
