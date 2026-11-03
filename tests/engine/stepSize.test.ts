import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BEHAVIOURS,
  DEFAULT_ROOM,
  DEFAULT_STEPS_PER_SECOND,
  createSimulationRun,
  exportRun,
  readRunExport,
  replaySetup,
  type Behaviour,
  type RunExport,
  type RunRecord,
} from "../../src/engine";
import { recordOf } from "./helpers";

const HOUR = 3600;

/**
 * Leaves out Restlessness, which came after these runs were made and, at the rates they had, of
 * 0, changes nothing else.
 */
function withoutRestlessness(key: string, value: unknown): unknown {
  return key === "restlessness" ? undefined : value;
}

/** What a run did, leaving out its setup, for comparing with runs made before step sizes. */
function fingerprint(record: RunRecord): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [
          record.samples,
          record.firedTransitions,
          record.timeOnSurfaceSeconds,
          record.timeInBehaviourSeconds,
          record.step,
          record.death,
        ],
        withoutRestlessness,
      ),
    )
    .digest("hex");
}

/** The run a file reproduces, advanced to the step it had reached. */
function reproduce(file: RunExport): RunRecord {
  const run = createSimulationRun(replaySetup(file));
  run.advanceSteps(file.step);
  return run.record();
}

describe("a Simulation Run's step size", () => {
  it("is 50 steps a second unless the setup gives one", () => {
    expect(DEFAULT_STEPS_PER_SECOND).toBe(50);
    expect(recordOf(1, 10).stepsPerSecond).toBe(50);
    expect(recordOf(1, 10, { stepsPerSecond: 100 }).stepsPerSecond).toBe(100);
  });

  it("leaves a default run exactly as it was before step sizes could be chosen", () => {
    // Fingerprints of 6-hour default runs made by model 0.6.0, before the step size was a setting.
    const before: Record<number, string> = {
      1: "36168dce2b806b3a861542f820f38dd45a0f416551525a16d047f3eeb385c198",
      2: "7050d1b9ddd88c8c7ebc7d2ceb98a105ae89cc4a36769fa32c795fd25431c9bb",
      3: "321219163db8b15e8f1dab060e901f6c86c846c4ffac61a0339c3efb2e39a7a1",
    };
    for (const seed of [1, 2, 3]) {
      expect(fingerprint(recordOf(seed, 6 * HOUR))).toBe(before[seed]);
    }
  });

  it("still records one sample per simulated second", () => {
    for (const stepsPerSecond of [25, 100]) {
      const record = recordOf(4, 90, { stepsPerSecond });
      expect(record.step).toBe(90 * stepsPerSecond);
      expect(record.samples.map((sample) => sample.timeSeconds)).toEqual(
        Array.from({ length: 91 }, (_, second) => second),
      );
      expect(record.samples.map((sample) => sample.step)).toEqual(
        Array.from({ length: 91 }, (_, second) => second * stepsPerSecond),
      );
    }
  });

  it("refuses a step size that isn't a whole number of steps a second in its range", () => {
    for (const stepsPerSecond of [0, 24, 50.5, 1001, Number.NaN]) {
      expect(() => createSimulationRun({ room: DEFAULT_ROOM, seed: 1, stepsPerSecond })).toThrow(
        /steps a second/,
      );
    }
  });

  it("is kept in the Export, which reproduces a run at another step size", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 5, stepsPerSecond: 100 });
    run.advanceSeconds(120);
    run.intervene({ type: "disturb" });
    run.advanceSteps(4321);
    const record = run.record();
    const file = readRunExport(JSON.stringify(exportRun(record))).run;

    expect(file.stepsPerSecond).toBe(100);
    expect(reproduce(file)).toEqual(record);
  });

  it("still reads and reproduces an Export written before step sizes could be chosen", () => {
    // Written by model 0.6.0 at record format version 1, with every kind of Intervention.
    const json = readFileSync(new URL("../fixtures/export-v1.json", import.meta.url), "utf8");
    const { run: file, sameModelVersion } = readRunExport(json);
    expect(file.recordFormatVersion).toBe(1);
    // Model 0.7.0 runs Chambers differently, but a run in the Room is the same, so it reproduces.
    expect(sameModelVersion).toBe(false);

    // As saved, where JSON writes -0 as 0.
    const again = JSON.parse(
      JSON.stringify(exportRun(reproduce(file), file.sampleIntervalSeconds), withoutRestlessness),
    ) as RunExport;
    expect(again.samples).toEqual(file.samples);
    expect(again.firedTransitions).toEqual(file.firedTransitions);
    expect(again.interventions).toEqual(file.interventions);
    expect(again.timeInBehaviourSeconds).toEqual(file.timeInBehaviourSeconds);
  });

  // Rates, time constants and noise act per simulated second, so only chance differs.
  const seeds = Array.from({ length: 12 }, (_, index) => index + 1);
  const hours = 6;
  const shares = new Map<number, Record<Behaviour, number>>();
  function sharesAt(stepsPerSecond: number): Record<Behaviour, number> {
    const cached = shares.get(stepsPerSecond);
    if (cached) return cached;
    const totals = Object.fromEntries(BEHAVIOURS.map((each) => [each, 0])) as Record<
      Behaviour,
      number
    >;
    for (const seed of seeds) {
      const record = recordOf(seed, hours * HOUR, { stepsPerSecond });
      for (const each of BEHAVIOURS) totals[each] += record.timeInBehaviourSeconds[each];
    }
    for (const each of BEHAVIOURS) totals[each] /= seeds.length * hours * HOUR;
    shares.set(stepsPerSecond, totals);
    return totals;
  }

  for (const stepsPerSecond of [25, 100]) {
    it(`doesn't change how long the fly spends in each behaviour on average, at ${stepsPerSecond} steps a second`, () => {
      const atDefault = sharesAt(50);
      const atOther = sharesAt(stepsPerSecond);
      for (const each of BEHAVIOURS) {
        expect(Math.abs(atOther[each] - atDefault[each]), each).toBeLessThan(
          0.25 * atDefault[each] + 0.01,
        );
      }
    });
  }
});
