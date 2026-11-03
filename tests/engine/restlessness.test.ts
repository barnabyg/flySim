import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS, type RunRecord, type RunSample } from "../../src/engine";
import { recordOf } from "./helpers";

const HOUR = 3600;

/** Restlessness with rates that push, whatever the defaults are while it is being tuned. */
const PUSHING = {
  parameters: {
    ...DEFAULT_PARAMETERS,
    startWalkingRestlessnessRate: 0.01,
    walkAfterGroomingRestlessnessRate: 0.01,
  },
};

/** Each change in Restlessness from one sample to the next, where no transition fired between. */
function changes(record: RunRecord): { behaviour: RunSample["behaviour"]; change: number }[] {
  const fired = new Set(record.firedTransitions.map((each) => Math.ceil(each.timeSeconds)));
  return record.samples.slice(1).flatMap((sample, index) => {
    const before = record.samples[index];
    if (!before || fired.has(Math.ceil(sample.timeSeconds))) return [];
    return [{ behaviour: before.behaviour, change: sample.restlessness - before.restlessness }];
  });
}

describe("Restlessness", () => {
  it("rises while the fly walks and falls while it keeps still", () => {
    const record = recordOf(5, 2 * HOUR);
    const all = changes(record);
    const walking = all.filter((each) => each.behaviour === "walking");
    const still = all.filter((each) => each.behaviour === "immobility" && each.change !== 0);

    expect(walking.length).toBeGreaterThan(100);
    expect(still.length).toBeGreaterThan(100);
    expect(walking.every((each) => each.change >= 0)).toBe(true);
    expect(still.every((each) => each.change < 0)).toBe(true);
    for (const sample of record.samples) {
      expect(sample.restlessness).toBeGreaterThanOrEqual(0);
      expect(sample.restlessness).toBeLessThanOrEqual(1);
    }
  });

  it("falls more slowly than it rises, so it outlasts a pause between walks", () => {
    const { parameters } = recordOf(5, 1);
    expect(parameters.restlessnessFallTimeConstantSeconds).toBeGreaterThan(
      parameters.restlessnessRiseTimeConstantSeconds,
    );
    // Over a minute of keeping still, most of it is left.
    expect(Math.exp(-60 / parameters.restlessnessFallTimeConstantSeconds)).toBeGreaterThan(0.5);
  });

  it("pushes a still or grooming fly to walk, as its own Driver", () => {
    const record = recordOf(6, 2 * HOUR, PUSHING);
    const pushes = record.samples.flatMap((sample) =>
      sample.transitions
        .filter((each) => each.transition === "immobility-to-walking")
        .map((each) => ({
          restlessness: sample.restlessness,
          push: each.contributions.restlessness,
        })),
    );
    const restless = pushes.filter((each) => each.restlessness > 0.05);

    expect(restless.length).toBeGreaterThan(10);
    for (const each of restless) expect(each.push).toBeGreaterThan(0);
    // A higher Restlessness pushes harder.
    const sorted = [...restless].sort((a, b) => a.restlessness - b.restlessness);
    expect(sorted.at(-1)?.push ?? 0).toBeGreaterThan(sorted[0]?.push ?? Infinity);

    const groomingPushes = record.samples.flatMap((sample) =>
      sample.transitions
        .filter((each) => each.transition === "grooming-to-walking")
        .map((each) => each.contributions.restlessness),
    );
    expect(groomingPushes.some((push) => push > 0)).toBe(true);
  });

  it("pushes nothing when its rates are 0", () => {
    const record = recordOf(6, HOUR, {
      parameters: {
        ...DEFAULT_PARAMETERS,
        startWalkingRestlessnessRate: 0,
        walkAfterGroomingRestlessnessRate: 0,
      },
    });
    for (const sample of record.samples) {
      for (const each of sample.transitions) expect(each.contributions.restlessness).toBe(0);
    }
  });

  it("gives the same hazard at the same Restlessness however long the bout has lasted", () => {
    // Only Restlessness and the fixed rates are left to set the hazard of walking.
    const { samples, firedTransitions } = recordOf(23, 4 * HOUR, {
      parameters: {
        ...PUSHING.parameters,
        startWalkingArousalRate: 0,
        startWalkingLightRate: 0,
        startWalkingHungerRate: 0,
        startWalkingOdourRate: 0,
        startWalkingThirstRate: 0,
        startWalkingHumidityRate: 0,
      },
    });
    const timeInBout = (timeSeconds: number): number => {
      const started = firedTransitions.findLast((fired) => fired.timeSeconds <= timeSeconds);
      return timeSeconds - (started?.timeSeconds ?? 0);
    };
    const immobile = samples
      .filter((sample) => sample.behaviour === "immobility")
      .map((sample) => ({
        restlessness: sample.restlessness,
        hazard: sample.transitions[0]?.hazard ?? NaN,
        timeInBout: timeInBout(sample.timeSeconds),
      }))
      .sort((a, b) => a.restlessness - b.restlessness);

    let comparisons = 0;
    for (let i = 1; i < immobile.length; i++) {
      const a = immobile[i - 1];
      const b = immobile[i];
      if (!a || !b) throw new Error("missing sample");
      if (Math.abs(a.timeInBout - b.timeInBout) > 30 && b.restlessness - a.restlessness < 0.002) {
        comparisons += 1;
        expect(Math.abs(a.hazard - b.hazard)).toBeLessThan(
          0.002 * PUSHING.parameters.startWalkingRestlessnessRate + 1e-12,
        );
      }
    }
    expect(comparisons).toBeGreaterThan(50);
  });
});
