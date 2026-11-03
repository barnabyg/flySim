import { DRIVERS, TRANSITIONS, type DriverId, type TransitionId } from "./model";
import { exportFileName, type RunExport } from "./runExport";
import type { FiredTransition, Intervention, RunSample, TransitionState } from "./simulationRun";

/**
 * An export as CSV tables for notebooks, under the same record format version as its JSON. Every
 * row carries the run's seed and model version, so tables from many runs stack into one.
 */
export interface RunTables {
  /** One row per exported sample, thinned as the JSON's samples are. */
  readonly samples: string;
  /** One row per fired transition, never thinned. */
  readonly transitions: string;
  /** One row per Intervention, never thinned. */
  readonly interventions: string;
}

export type RunTableName = keyof RunTables;

export const RUN_TABLE_NAMES: readonly RunTableName[] = ["samples", "transitions", "interventions"];

type Cell = string | number | boolean | null | undefined;

/**
 * A table's columns, each with how to read its cell from a row's source. Keeping each name beside
 * its value means the columns, which files depend on, can't drift out of line with their cells.
 */
type Columns<Source> = readonly (readonly [name: string, cell: (source: Source) => Cell])[];

/** Columns as snake_case, as notebooks expect. */
function snakeCase(name: string): string {
  return name.replace(/-/g, "_").replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Empty for a value that doesn't apply, which a notebook reads as missing rather than 0. */
function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The columns every table starts with, so tables from many runs stack into one. */
function withRunColumns<Row extends { readonly step: number }>(
  run: RunExport,
  columns: Columns<Row>,
): Columns<Row> {
  return [
    ["seed", () => run.seed],
    ["model_version", () => run.modelVersion],
    ["step", (row) => row.step],
    ["time_s", (row) => row.step / run.stepsPerSecond],
    ...columns,
  ];
}

function table<Row extends { readonly step: number }>(
  run: RunExport,
  columns: Columns<Row>,
  rows: readonly Row[],
): string {
  const all = withRunColumns(run, columns);
  const lines = [
    all.map(([name]) => name).join(","),
    ...rows.map((row) => all.map(([, cell]) => csvCell(cell(row))).join(",")),
  ];
  return lines.join("\n") + "\n";
}

/** A column per Driver, with its contribution to a hazard. */
function driverColumns<Source>(
  prefix: string,
  contributions: (source: Source) => Readonly<Record<DriverId, number>> | undefined,
): Columns<Source> {
  return DRIVERS.map((driver) => [
    `${prefix}${snakeCase(driver)}`,
    (source) => contributions(source)?.[driver],
  ]);
}

/** Every transition has columns, and those not available from the behaviour are empty. */
function transitionColumns(id: TransitionId): Columns<RunSample> {
  const prefix = `${snakeCase(id)}_`;
  const state = (sample: RunSample): TransitionState | undefined =>
    sample.transitions.find((each) => each.transition === id);
  return [
    [`${prefix}hazard`, (sample) => state(sample)?.hazard],
    ...driverColumns(prefix, (sample: RunSample) => state(sample)?.contributions),
    [`${prefix}p_next_minute`, (sample) => state(sample)?.fireProbabilityNextMinute],
  ];
}

const SAMPLE_COLUMNS: Columns<RunSample> = [
  ["time_of_day_h", (sample) => sample.timeOfDayHours],
  ["light_level", (sample) => sample.lightLevel],
  ["lights_on_h", (sample) => sample.lightSchedule.lightsOnHour],
  ["light_hours", (sample) => sample.lightSchedule.lightHours],
  ["behaviour", (sample) => sample.behaviour],
  ["vigilance_state", (sample) => sample.vigilanceState],
  ["surface", (sample) => sample.surface],
  ["x", (sample) => sample.position.x],
  ["y", (sample) => sample.position.y],
  ["z", (sample) => sample.position.z],
  ["speed_m_per_s", (sample) => sample.speedMetresPerSecond],
  ["energy", (sample) => sample.energy],
  ["hydration", (sample) => sample.hydration],
  ["hunger", (sample) => sample.hunger],
  ["thirst", (sample) => sample.thirst],
  ["sleep_pressure", (sample) => sample.sleepPressure],
  ["sleep_depth", (sample) => sample.sleepDepth],
  ["arousal", (sample) => sample.arousal],
  ["restlessness", (sample) => sample.restlessness],
  ["circadian_phase_h", (sample) => sample.circadianPhaseHours],
  ["startle", (sample) => sample.startle],
  ["odour", (sample) => sample.senses.odour],
  ["humidity", (sample) => sample.senses.humidity],
  ["recent_odour", (sample) => sample.recentOdour],
  ["recent_humidity", (sample) => sample.recentHumidity],
  ["touching_food", (sample) => sample.senses.touchingFood],
  ["touching_water", (sample) => sample.senses.touchingWater],
  ["food_x", (sample) => sample.food?.x],
  ["food_y", (sample) => sample.food?.y],
  ["water_x", (sample) => sample.water?.x],
  ["water_y", (sample) => sample.water?.y],
  ["death_cause", (sample) => sample.death?.cause],
  ...TRANSITIONS.flatMap(({ id }) => transitionColumns(id)),
];

const TRANSITION_COLUMNS: Columns<FiredTransition> = [
  ["transition", (fired) => fired.transition],
  ["from", (fired) => fired.from],
  ["to", (fired) => fired.to],
  ["trigger_level", (fired) => fired.triggerLevel],
  ["hazard", (fired) => fired.hazard],
  ...driverColumns("", (fired: FiredTransition) => fired.contributions),
  ["p_next_minute", (fired) => fired.fireProbabilityNextMinute],
  ["vigilance_state", (fired) => fired.vigilanceState],
  ["sleep_pressure", (fired) => fired.sleepPressure],
  ["sleep_depth", (fired) => fired.sleepDepth],
  ["hunger", (fired) => fired.hunger],
  ["thirst", (fired) => fired.thirst],
];

const INTERVENTION_COLUMNS: Columns<Intervention> = [
  ["type", (intervention) => intervention.type],
  ["source", (intervention) => ("source" in intervention ? intervention.source : null)],
  ["x", (intervention) => (intervention.type === "move-source" ? intervention.place.x : null)],
  ["y", (intervention) => (intervention.type === "move-source" ? intervention.place.y : null)],
  [
    "lights_on_h",
    (intervention) =>
      intervention.type === "light-schedule" ? intervention.lightSchedule.lightsOnHour : null,
  ],
  [
    "light_hours",
    (intervention) =>
      intervention.type === "light-schedule" ? intervention.lightSchedule.lightHours : null,
  ],
];

/** The CSV tables of an export. */
export function exportTables(run: RunExport): RunTables {
  return {
    samples: table(run, SAMPLE_COLUMNS, run.samples),
    transitions: table(run, TRANSITION_COLUMNS, run.firedTransitions),
    interventions: table(run, INTERVENTION_COLUMNS, run.interventions),
  };
}

/** The forms a run can be exported in. */
export type ExportFormat = "json" | "csv";

/** One file of an export, named as the viewer and the batch both name it, before it is zipped. */
export interface ExportFile {
  readonly name: string;
  readonly text: string;
  /** Which CSV table it is, or null for the JSON. */
  readonly table: RunTableName | null;
}

/** An export's files in a format: one JSON file, or the three CSV tables. */
export function exportFiles(run: RunExport, format: ExportFormat): readonly ExportFile[] {
  if (format === "json") {
    return [{ name: exportFileName(run), text: JSON.stringify(run), table: null }];
  }
  const tables = exportTables(run);
  return RUN_TABLE_NAMES.map((name) => ({
    name: exportFileName(run, name),
    text: tables[name],
    table: name,
  }));
}
