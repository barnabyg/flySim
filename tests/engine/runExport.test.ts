import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  EXPORT_FORMAT,
  MODEL_VERSION,
  RECORD_FORMAT_VERSION,
  DEFAULT_STEPS_PER_SECOND,
  createSimulationRun,
  exportFileName,
  exportRun,
  readRunExport,
  replaySetup,
  type RunExport,
  type RunRecord,
  type SimulationRun,
} from "../../src/engine";

const MINUTE = 60;

/** A run like a viewer's, with Interventions made live part-way through seconds. */
function liveRun(seed: number, maxRecordedSamples = Infinity): SimulationRun {
  const run = createSimulationRun({
    room: { widthMetres: 0.6, depthMetres: 0.8, heightMetres: 0.4 },
    seed,
    parameters: { ...DEFAULT_PARAMETERS, initialEnergy: 0.4 },
    food: { x: 0.1, y: 0.2 },
    lightSchedule: { lightsOnHour: 6, lightHours: 8 },
    triggerStream: 11,
    maxRecordedSamples,
  });
  run.advanceSteps(2 * MINUTE * DEFAULT_STEPS_PER_SECOND + 13);
  run.intervene({ type: "disturb" });
  run.advanceSteps(MINUTE * DEFAULT_STEPS_PER_SECOND + 7);
  run.intervene({ type: "move-source", source: "water", place: { x: 0.3, y: 0.3 } });
  run.intervene({ type: "light-schedule", lightSchedule: { lightsOnHour: 0, lightHours: 24 } });
  run.advanceSteps(4 * MINUTE * DEFAULT_STEPS_PER_SECOND + 29);
  return run;
}

/** What a file would hold once saved and read back. */
function throughFile(file: RunExport): RunExport {
  return readRunExport(gunzipSync(gzipSync(JSON.stringify(file))).toString("utf8")).run;
}

/** The run a file reproduces, advanced to the step it had reached. */
function reproduce(file: RunExport): RunRecord {
  const run = createSimulationRun(replaySetup(file));
  run.advanceSteps(file.step);
  return run.record();
}

describe("exporting a run as JSON", () => {
  it("tags the file with everything needed to trace and reproduce the run", () => {
    const record = liveRun(1).record();
    const file = throughFile(exportRun(record));

    expect(file).toMatchObject({
      format: EXPORT_FORMAT,
      recordFormatVersion: RECORD_FORMAT_VERSION,
      modelVersion: MODEL_VERSION,
      seed: 1,
      triggerStream: 11,
      stepsPerSecond: DEFAULT_STEPS_PER_SECOND,
      room: { widthMetres: 0.6, depthMetres: 0.8, heightMetres: 0.4 },
      food: { x: 0.1, y: 0.2 },
      water: record.water,
      lightSchedule: { lightsOnHour: 6, lightHours: 8 },
      step: record.step,
      death: null,
      samplesStartSeconds: 0,
      sampleIntervalSeconds: 10,
    });
    expect(file.parameters).toEqual({ ...DEFAULT_PARAMETERS, initialEnergy: 0.4 });
    expect(file.interventions).toEqual(record.interventions);
    expect(file.interventions.map((each) => each.type)).toEqual([
      "disturb",
      "move-source",
      "light-schedule",
    ]);
    expect(file.firedTransitions).toEqual(record.firedTransitions);
    expect(file.firedTransitions.length).toBeGreaterThan(5);
    expect(exportFileName(file, "samples")).toBe(
      `fly-sim-seed-1-at-${Math.floor(record.step / DEFAULT_STEPS_PER_SECOND)}s-samples.csv.gz`,
    );
    expect(exportFileName(file)).toBe(
      `fly-sim-seed-1-at-${Math.floor(record.step / DEFAULT_STEPS_PER_SECOND)}s.json.gz`,
    );
  });

  it("reproduces a Run Record identical to the original from the file alone, in Node", () => {
    for (const seed of [2, 3]) {
      const original = liveRun(seed).record();
      expect(reproduce(throughFile(exportRun(original)))).toEqual(original);
    }
  });

  it("keeps samples every N seconds in full detail, and every transition and Intervention", () => {
    const record = liveRun(4).record();
    for (const interval of [1, 10, 60]) {
      const file = exportRun(record, interval);
      const times = file.samples.map((sample) => sample.timeSeconds);
      expect(file.sampleIntervalSeconds).toBe(interval);
      expect(times[0]).toBe(0);
      expect(times).toHaveLength(Math.floor(record.step / DEFAULT_STEPS_PER_SECOND / interval) + 1);
      for (const sample of file.samples) {
        expect(sample.step % (interval * DEFAULT_STEPS_PER_SECOND)).toBe(0);
        expect(sample).toEqual(record.samples[sample.step / DEFAULT_STEPS_PER_SECOND]);
      }
      expect(file.firedTransitions).toEqual(record.firedTransitions);
      expect(file.interventions).toEqual(record.interventions);
    }
    expect(() => exportRun(record, 0)).toThrow();
    expect(() => exportRun(record, 2.5)).toThrow();
  });

  it("says where its samples start once older ones were dropped, and still reproduces the run", () => {
    const original = liveRun(5, 100).record();
    const file = throughFile(exportRun(original));
    expect(file.samplesStartSeconds).toBeGreaterThan(0);
    // It is when the exported samples start, at an interval that needn't divide what was dropped.
    for (const interval of [10, 7]) {
      const thinned = exportRun(original, interval);
      expect(thinned.samplesStartSeconds).toBe(thinned.samples[0]?.timeSeconds);
      expect(thinned.samplesStartSeconds).toBeGreaterThanOrEqual(
        original.samples[0]?.timeSeconds ?? 0,
      );
    }

    // The whole run comes back, including the samples the viewer had dropped.
    const whole = reproduce(file);
    expect(whole.samples[0]?.timeSeconds).toBe(0);
    expect(whole.samples.slice(-original.samples.length)).toEqual(original.samples);
    expect({ ...whole, samples: original.samples }).toEqual(original);
  });
});

describe("reading an exported file", () => {
  const file = exportRun(liveRun(6).record());

  it("refuses a file that isn't an export", () => {
    for (const text of ["", "not json", "[1, 2]", "{}", JSON.stringify({ seed: 1 })]) {
      expect(() => readRunExport(text)).toThrow(/isn't an exported fly simulator run/);
    }
    for (const [broken, why] of [
      [{ ...file, interventions: [{ type: "disturb", step: -5 }] }, /step -5/],
      [
        { ...file, interventions: [{ type: "explode", step: 5 }] },
        /no Intervention of type explode/,
      ],
      [{ ...file, interventions: [{ type: "remove-source", source: "sugar", step: 5 }] }, /sugar/],
      [{ ...file, room: { widthMetres: 1 } }, /Room has no size/],
      [{ ...file, parameters: { arousalNoise: 1 } }, /no value for the model parameters/],
    ] as const) {
      expect(() => readRunExport(JSON.stringify(broken))).toThrow(/isn't an exported/);
      expect(() => readRunExport(JSON.stringify(broken))).toThrow(why);
    }
  });

  it("refuses a record format version it can't read", () => {
    for (const recordFormatVersion of [0, 2, "1", undefined]) {
      expect(() => readRunExport(JSON.stringify({ ...file, recordFormatVersion }))).toThrow(
        /record format version .* can't read/,
      );
    }
  });

  it("says when the file comes from a different model version", () => {
    expect(readRunExport(JSON.stringify(file)).sameModelVersion).toBe(true);
    const older = readRunExport(JSON.stringify({ ...file, modelVersion: "0.1.0" }));
    expect(older.sameModelVersion).toBe(false);
    expect(older.run.modelVersion).toBe("0.1.0");
  });
});
