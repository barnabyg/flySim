import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  STEPS_PER_SECOND,
  createSimulationRun,
  type FloorPlace,
  type Intervention,
  type RunSample,
} from "../../src/engine";
import { recordOf } from "./helpers";

const MINUTE = 60;
const HOUR = 3600;

function startOf(seed: number): FloorPlace {
  const { position } = createSimulationRun({ room: DEFAULT_ROOM, seed }).current();
  return { x: position.x, y: position.y };
}

describe("moving a source", () => {
  it("is an Intervention stored in the run record with its step and new place", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 1 });
    run.advanceSeconds(10);
    const moved = run.intervene({
      type: "move-source",
      source: "water",
      place: { x: 0.2, y: 0.8 },
    });
    run.advanceSeconds(1);
    const { interventions, samples } = run.record();

    expect(moved).toEqual({
      type: "move-source",
      source: "water",
      place: { x: 0.2, y: 0.8 },
      step: 10 * STEPS_PER_SECOND,
    });
    expect(interventions).toEqual([moved]);
    expect(samples.at(-1)?.water).toEqual({ x: 0.2, y: 0.8 });
    expect(samples.at(-1)?.food).toEqual(samples[0]?.food);
  });

  it("can't put a source off the floor", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 1 });
    expect(() =>
      run.intervene({ type: "move-source", source: "food", place: { x: 1.2, y: 0.5 } }),
    ).toThrow();
    expect(() =>
      createSimulationRun({
        room: DEFAULT_ROOM,
        seed: 1,
        interventions: [{ step: 5, type: "move-source", source: "food", place: { x: 0.5, y: -1 } }],
      }),
    ).toThrow();
  });

  it("takes its field and contact with it", () => {
    const start = startOf(2);
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 2 });
    const before = run.current().senses;
    run.intervene({ type: "move-source", source: "food", place: start });
    run.intervene({ type: "move-source", source: "water", place: start });
    run.advanceSteps(1);
    const after = run.current();

    // The fly hasn't moved yet, and now it stands on both.
    expect(after.position.x).toBeCloseTo(start.x, 9);
    expect(before.touchingFood).toBe(false);
    expect(after.senses.touchingFood).toBe(true);
    expect(after.senses.touchingWater).toBe(true);
    expect(after.senses.odour).toBeCloseTo(1, 6);
    expect(after.senses.humidity).toBeCloseTo(
      DEFAULT_PARAMETERS.globalHumidity + DEFAULT_PARAMETERS.humidityRise,
      6,
    );
  });

  it("is reproduced exactly by the same seed, setup and moves", () => {
    const moves: Intervention[] = [
      {
        step: 5 * MINUTE * STEPS_PER_SECOND,
        type: "move-source",
        source: "food",
        place: startOf(3),
      },
      {
        step: 20 * MINUTE * STEPS_PER_SECOND,
        type: "move-source",
        source: "water",
        place: { x: 0.1, y: 0.9 },
      },
    ];
    const whole = recordOf(3, HOUR, { interventions: moves });
    // Made during the run, in uneven steps, as the viewer would at any speed.
    const live = createSimulationRun({ room: DEFAULT_ROOM, seed: 3 });
    for (const move of moves) {
      live.advanceSteps(move.step - live.current().step);
      live.intervene(move);
    }
    while (live.current().timeSeconds < HOUR) live.advanceSteps(777);
    const liveRecord = live.record();
    const upToAnHour = (samples: readonly RunSample[]) =>
      samples.filter((sample) => sample.timeSeconds <= HOUR);

    expect(upToAnHour(liveRecord.samples)).toEqual(whole.samples);
    expect(liveRecord.interventions).toEqual(whole.interventions);
  });
});

describe("a fly after its food has moved", () => {
  /** A hungry fly with the food under it, which then moves away to a place given. */
  function movedAway(seed: number, to: FloorPlace) {
    const parameters = { ...DEFAULT_PARAMETERS, initialEnergy: 0.2, initialHydration: 0.9 };
    return recordOf(seed, HOUR, {
      parameters,
      food: startOf(seed),
      water: null,
      interventions: [
        { step: 10 * MINUTE * STEPS_PER_SECOND, type: "move-source", source: "food", place: to },
      ],
    });
  }

  it("goes elsewhere, but can't head for food it can't sense", () => {
    let comparedSeconds = 0;
    let changed = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const stayed = recordOf(seed, HOUR, {
        parameters: { ...DEFAULT_PARAMETERS, initialEnergy: 0.2, initialHydration: 0.9 },
        food: startOf(seed),
        water: null,
      });
      // Two far corners, both well out of range of where the fly is when the food moves.
      const toOne = movedAway(seed, { x: 0.02, y: 0.98 });
      const toOther = movedAway(seed, { x: 0.98, y: 0.02 });
      const moment = 10 * MINUTE;
      const after = (samples: readonly RunSample[]) =>
        samples.filter((sample) => sample.timeSeconds > moment);

      const position = (sample: RunSample | undefined) => sample?.position;
      if (
        JSON.stringify(after(stayed.samples).map(position)) !==
        JSON.stringify(after(toOne.samples).map(position))
      ) {
        changed += 1;
      }

      // Until it smells the food in its new place, the fly can't tell which corner it went to.
      const [one, other] = [after(toOne.samples), after(toOther.samples)];
      // A whiff between samples shows only as a rise in what it has sensed lately.
      const firstSmelt = (samples: readonly RunSample[]) =>
        samples.findIndex(
          (sample, index) =>
            sample.senses.odour > 0 || sample.recentOdour > (samples[index - 1]?.recentOdour ?? 1),
        );
      const smelt = firstSmelt(one);
      const smeltOther = firstSmelt(other);
      const until = Math.min(
        smelt === -1 ? one.length : smelt,
        smeltOther === -1 ? other.length : smeltOther,
      );
      const strip = (sample: RunSample) => ({ ...sample, food: null });
      expect(one.slice(0, until).map(strip)).toEqual(other.slice(0, until).map(strip));
      comparedSeconds += until;
    }

    expect(changed).toBeGreaterThanOrEqual(5);
    expect(comparedSeconds).toBeGreaterThan(HOUR);
  });
});
