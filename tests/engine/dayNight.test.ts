import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIGHT_SCHEDULE,
  DEFAULT_ROOM,
  createSimulationRun,
  type LightSchedule,
  type RunRecord,
  type RunSample,
} from "../../src/engine";

const HOUR = 3600;

function recordOf(seed: number, simulatedSeconds: number, lightSchedule?: LightSchedule) {
  const run = createSimulationRun({
    room: DEFAULT_ROOM,
    seed,
    ...(lightSchedule ? { lightSchedule } : {}),
  });
  run.advanceSeconds(simulatedSeconds);
  return run.record();
}

function sampleAt(record: RunRecord, timeSeconds: number): RunSample {
  const sample = record.samples.find((each) => each.timeSeconds === timeSeconds);
  if (!sample) throw new Error(`No sample at ${timeSeconds}`);
  return sample;
}

describe("the light schedule", () => {
  it("starts a default run at lights-on with a 12:12 schedule", () => {
    const { lightSchedule, samples } = recordOf(1, 1);

    expect(lightSchedule).toEqual(DEFAULT_LIGHT_SCHEDULE);
    expect(lightSchedule.lightHours).toBe(12);
    expect(samples[0]?.timeOfDayHours).toBe(lightSchedule.lightsOnHour);
    expect(samples[0]?.lightLevel).toBe(1);
  });

  it("exposes a time of day and light level that follow the schedule", () => {
    const record = recordOf(1, 25 * HOUR);
    const at = (hours: number): RunSample => sampleAt(record, hours * HOUR);

    expect(at(6).timeOfDayHours).toBeCloseTo(12, 9);
    expect(at(6).lightLevel).toBe(1);
    expect(sampleAt(record, 12 * HOUR - 1).lightLevel).toBe(1);
    expect(at(12).timeOfDayHours).toBeCloseTo(18, 9);
    expect(at(12).lightLevel).toBe(0);
    // The clock wraps at midnight.
    expect(at(18).timeOfDayHours).toBeCloseTo(0, 9);
    expect(at(18).lightLevel).toBe(0);
    expect(sampleAt(record, 24 * HOUR - 1).lightLevel).toBe(0);
    expect(at(24).timeOfDayHours).toBeCloseTo(6, 9);
    expect(at(24).lightLevel).toBe(1);
  });

  it("follows a schedule other than the default", () => {
    const record = recordOf(1, 3 * HOUR, { lightsOnHour: 8, lightHours: 2 });

    expect(sampleAt(record, 0).timeOfDayHours).toBe(8);
    expect(sampleAt(record, 2 * HOUR - 1).lightLevel).toBe(1);
    expect(sampleAt(record, 2 * HOUR).lightLevel).toBe(0);
    expect(sampleAt(record, 2 * HOUR).timeOfDayHours).toBeCloseTo(10, 9);
  });

  it("reproduces the run exactly, whatever the pace of advancing", () => {
    const lightSchedule = { lightsOnHour: 6, lightHours: 1 };
    const inPieces = createSimulationRun({ room: DEFAULT_ROOM, seed: 9, lightSchedule });
    for (const steps of [1, 999, 50_000, 7, 129_000, 13, 180_000]) inPieces.advanceSteps(steps);

    const inOneGo = createSimulationRun({ room: DEFAULT_ROOM, seed: 9, lightSchedule });
    inOneGo.advanceSteps(360_020);

    expect(inPieces.record()).toEqual(inOneGo.record());
  });

  it("reaches the fly through its senses", () => {
    const { samples } = recordOf(1, 13 * HOUR);

    expect(new Set(samples.map((sample) => sample.senses.lightLevel))).toEqual(new Set([0, 1]));
    for (const sample of samples) expect(sample.senses.lightLevel).toBe(sample.lightLevel);
  });

  it("rejects a schedule that can't exist", () => {
    for (const lightSchedule of [
      { lightsOnHour: 24, lightHours: 12 },
      { lightsOnHour: -1, lightHours: 12 },
      { lightsOnHour: 6, lightHours: 25 },
      { lightsOnHour: 6, lightHours: -1 },
    ]) {
      expect(() => createSimulationRun({ room: DEFAULT_ROOM, seed: 1, lightSchedule })).toThrow(
        /lights/,
      );
    }
  });
});
