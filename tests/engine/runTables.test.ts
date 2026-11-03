import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  DRIVERS,
  MODEL_VERSION,
  DEFAULT_STEPS_PER_SECOND,
  TRANSITIONS,
  createSimulationRun,
  exportRun,
  exportTables,
  type Behaviour,
  type RunRecord,
} from "../../src/engine";

const MINUTE = 60;
const HOUR = 3600;

/** A table's rows as objects keyed by its header, which is what a notebook would load. */
function parse(csv: string): { header: string[]; rows: Record<string, string>[] } {
  const [headerLine = "", ...lines] = csv.trimEnd().split("\n");
  const header = headerLine.split(",");
  const rows = lines.map((line) => {
    const cells = line.split(",");
    expect(cells).toHaveLength(header.length);
    return Object.fromEntries(header.map((column, index) => [column, cells[index] ?? ""]));
  });
  return { header, rows };
}

function recordWithInterventions(seed: number, seconds: number): RunRecord {
  const run = createSimulationRun({ room: DEFAULT_ROOM, seed });
  run.advanceSeconds(MINUTE);
  run.intervene({ type: "disturb" });
  run.advanceSeconds(MINUTE);
  run.intervene({ type: "light-schedule", lightSchedule: { lightsOnHour: 8, lightHours: 10 } });
  run.intervene({ type: "move-source", source: "food", place: { x: 0.25, y: 0.75 } });
  run.advanceSeconds(MINUTE);
  run.intervene({ type: "remove-source", source: "water" });
  run.advanceSeconds(seconds - 3 * MINUTE);
  return run.record();
}

/** The fly is inactive, with no movement at all, while immobile or asleep. */
const INACTIVE: readonly Behaviour[] = ["immobility", "sleeping"];

/**
 * Complete Inactivity Bouts, from the behaviour each transition led to, as a notebook would work
 * them out. The bouts cut short by the start and end of the run are left out.
 */
function inactivityBouts(
  to: readonly { step: number; to: string }[],
): { start: number; end: number }[] {
  const bouts: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (const { step, to: behaviour } of to) {
    const inactive = (INACTIVE as readonly string[]).includes(behaviour);
    if (inactive && start === null) start = step;
    if (!inactive && start !== null) {
      bouts.push({ start, end: step });
      start = null;
    }
  }
  return bouts;
}

describe("exporting a run whose fly died", () => {
  it("keeps the moment of death among the samples, with its cause", () => {
    const run = createSimulationRun({
      room: DEFAULT_ROOM,
      seed: 8,
      parameters: { ...DEFAULT_PARAMETERS, initialHydration: 0.01 },
    });
    run.advanceSeconds(30);
    run.intervene({ type: "remove-source", source: "water" });
    while (!run.current().death) run.advanceSteps(1000);
    const record = run.record();
    const file = exportRun(record);
    const rows = parse(exportTables(file).samples).rows;

    expect((record.death?.step ?? 0) % 500).not.toBe(0);
    expect(file.samples.at(-1)).toEqual(record.samples.at(-1));
    expect(rows.at(-1)).toMatchObject({
      step: String(record.death?.step),
      death_cause: "desiccation",
    });
    expect(rows.slice(0, -1).every((row) => row["death_cause"] === "")).toBe(true);
  });
});

describe("exporting a run as CSV tables", () => {
  const record = recordWithInterventions(3, HOUR);
  const file = exportRun(record);
  const tables = exportTables(file);
  const samples = parse(tables.samples);
  const transitions = parse(tables.transitions);
  const interventions = parse(tables.interventions);

  it("has one header row with stable column names, and the seed and model version in every row", () => {
    expect(samples.header.slice(0, 8)).toEqual([
      "seed",
      "model_version",
      "step",
      "time_s",
      "time_of_day_h",
      "light_level",
      "lights_on_h",
      "light_hours",
    ]);
    for (const column of [
      "behaviour",
      "vigilance_state",
      "surface",
      "x",
      "y",
      "z",
      "energy",
      "hydration",
      "hunger",
      "thirst",
      "sleep_pressure",
      "sleep_depth",
      "immobility_to_walking_hazard",
      "immobility_to_walking_sleep_pressure",
      "immobility_to_walking_p_next_minute",
      "drinking_to_immobility_humidity",
    ]) {
      expect(samples.header).toContain(column);
    }
    // The layout is a compatibility contract, so a new Driver or transition must change this on
    // purpose, with the record format version.
    expect(samples.header).toHaveLength(243);
    expect(samples.header).toContain("death_cause");
    expect(TRANSITIONS.length * (DRIVERS.length + 2)).toBe(208);
    expect(transitions.header).toEqual([
      "seed",
      "model_version",
      "step",
      "time_s",
      "transition",
      "from",
      "to",
      "trigger_level",
      "hazard",
      "spontaneous",
      "arousal",
      "contact",
      "light",
      "sleep_pressure",
      "circadian",
      "startle",
      "hunger",
      "odour",
      "thirst",
      "humidity",
      "p_next_minute",
      "vigilance_state",
      "sleep_pressure",
      "sleep_depth",
      "hunger",
      "thirst",
    ]);
    expect(interventions.header).toEqual([
      "seed",
      "model_version",
      "step",
      "time_s",
      "type",
      "source",
      "x",
      "y",
      "lights_on_h",
      "light_hours",
    ]);
    for (const { rows } of [samples, transitions, interventions]) {
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row["seed"]).toBe("3");
        expect(row["model_version"]).toBe(MODEL_VERSION);
      }
    }
  });

  it("has a row for each exported sample that agrees with it", () => {
    expect(samples.rows).toHaveLength(file.samples.length);
    expect(samples.rows).toHaveLength(HOUR / 10 + 1);
    samples.rows.forEach((row, index) => {
      const sample = file.samples[index];
      if (!sample) throw new Error("missing sample");
      expect(Number(row["step"])).toBe(sample.step);
      expect(Number(row["time_s"])).toBeCloseTo(sample.timeSeconds, 9);
      expect(row["behaviour"]).toBe(sample.behaviour);
      expect(row["vigilance_state"]).toBe(sample.vigilanceState);
      expect(row["surface"]).toBe(sample.surface ?? "");
      expect(Number(row["x"])).toBe(sample.position.x);
      expect(Number(row["energy"])).toBe(sample.energy);
      expect(Number(row["thirst"])).toBe(sample.thirst);
      expect(row["sleep_depth"]).toBe(sample.sleepDepth === null ? "" : String(sample.sleepDepth));
      expect(row["water_x"]).toBe(sample.water ? String(sample.water.x) : "");
      for (const { id } of TRANSITIONS) {
        const column = id.replace(/-/g, "_");
        const state = sample.transitions.find((each) => each.transition === id);
        // A transition that isn't available has empty cells, not zeros.
        expect(row[`${column}_hazard`]).toBe(state ? String(state.hazard) : "");
        expect(row[`${column}_sleep_pressure`]).toBe(
          state ? String(state.contributions.sleepPressure) : "",
        );
        expect(row[`${column}_p_next_minute`]).toBe(
          state ? String(state.fireProbabilityNextMinute) : "",
        );
      }
    });
    // The fly slept in its first hour, and the water had gone.
    expect(samples.rows.some((row) => row["sleep_depth"] !== "")).toBe(true);
    expect(samples.rows.at(-1)?.["water_x"]).toBe("");
  });

  it("thins samples as the JSON does, and keeps every transition and Intervention", () => {
    expect(parse(exportTables(exportRun(record, 60)).samples).rows).toHaveLength(HOUR / 60 + 1);
    expect(transitions.rows).toHaveLength(record.firedTransitions.length);
    transitions.rows.forEach((row, index) => {
      const fired = record.firedTransitions[index];
      if (!fired) throw new Error("missing transition");
      expect(row).toMatchObject({
        step: String(fired.step),
        transition: fired.transition,
        from: fired.from,
        to: fired.to,
        trigger_level: String(fired.triggerLevel),
        hazard: String(fired.hazard),
        startle: String(fired.contributions.startle),
        vigilance_state: fired.vigilanceState,
        sleep_depth: fired.sleepDepth === null ? "" : String(fired.sleepDepth),
      });
    });
    expect(interventions.rows).toEqual([
      expect.objectContaining({ step: "3000", time_s: "60", type: "disturb", source: "" }),
      expect.objectContaining({
        step: "6000",
        type: "light-schedule",
        lights_on_h: "8",
        light_hours: "10",
      }),
      expect.objectContaining({ type: "move-source", source: "food", x: "0.25", y: "0.75" }),
      expect.objectContaining({ step: "9000", type: "remove-source", source: "water", x: "" }),
    ]);
  });

  it("gives Inactivity Bout durations from fired transitions that agree with the Run Record", () => {
    const fromTable = inactivityBouts(
      transitions.rows.map((row) => ({ step: Number(row["step"]), to: row["to"] ?? "" })),
    );
    const fromRecord = inactivityBouts(record.firedTransitions);

    expect(fromTable).toEqual(fromRecord);
    expect(fromTable.length).toBeGreaterThan(3);
    // The full-detail samples agree: the fly is inactive throughout each bout, and not either side.
    const behaviourAt = (step: number) =>
      record.samples.find((sample) => sample.step === step)?.behaviour;
    for (const { start, end } of fromTable) {
      for (
        let second = Math.ceil(start / DEFAULT_STEPS_PER_SECOND);
        second * DEFAULT_STEPS_PER_SECOND < end;
        second++
      ) {
        expect(INACTIVE).toContain(behaviourAt(second * DEFAULT_STEPS_PER_SECOND));
      }
    }
    const lengths = fromTable.map(({ start, end }) => (end - start) / DEFAULT_STEPS_PER_SECOND);
    const inactiveSeconds = INACTIVE.reduce(
      (total, behaviour) => total + record.timeInBehaviourSeconds[behaviour],
      0,
    );
    expect(lengths.reduce((total, seconds) => total + seconds, 0)).toBeLessThanOrEqual(
      inactiveSeconds,
    );
  });
});
