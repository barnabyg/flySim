import { DRIVERS, TRANSITIONS, type DriverId, type TransitionId } from "./model";
import type { RunExport } from "./runExport";
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

/** Columns as snake_case, as notebooks expect. */
function snakeCase(name: string): string {
  return name.replace(/-/g, "_").replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Empty for a value that doesn't apply, which a notebook reads as missing rather than 0. */
function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function table(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\n") + "\n";
}

const RUN_COLUMNS = ["seed", "model_version", "step", "time_s"];

function driverColumns(prefix: string): string[] {
  return DRIVERS.map((driver) => `${prefix}${snakeCase(driver)}`);
}

function contributionCells(contributions: Readonly<Record<DriverId, number>>): number[] {
  return DRIVERS.map((driver) => contributions[driver]);
}

const SAMPLE_COLUMNS = [
  ...RUN_COLUMNS,
  "time_of_day_h",
  "light_level",
  "lights_on_h",
  "light_hours",
  "behaviour",
  "vigilance_state",
  "surface",
  "x",
  "y",
  "z",
  "speed_m_per_s",
  "energy",
  "hydration",
  "hunger",
  "thirst",
  "sleep_pressure",
  "sleep_depth",
  "arousal",
  "circadian_phase_h",
  "startle",
  "odour",
  "humidity",
  "recent_odour",
  "recent_humidity",
  "touching_food",
  "touching_water",
  "food_x",
  "food_y",
  "water_x",
  "water_y",
  ...TRANSITIONS.flatMap(({ id }) => [
    `${snakeCase(id)}_hazard`,
    ...driverColumns(`${snakeCase(id)}_`),
    `${snakeCase(id)}_p_next_minute`,
  ]),
];

/** Every transition has columns, and those not available from the behaviour are empty. */
function transitionCells(transitions: readonly TransitionState[]): Cell[] {
  const available = new Map<TransitionId, TransitionState>(
    transitions.map((each) => [each.transition, each]),
  );
  return TRANSITIONS.flatMap(({ id }) => {
    const state = available.get(id);
    if (!state) return Array<Cell>(DRIVERS.length + 2).fill(null);
    return [
      state.hazard,
      ...contributionCells(state.contributions),
      state.fireProbabilityNextMinute,
    ];
  });
}

function sampleRow(run: RunExport, sample: RunSample): Cell[] {
  return [
    run.seed,
    run.modelVersion,
    sample.step,
    sample.step / run.stepsPerSecond,
    sample.timeOfDayHours,
    sample.lightLevel,
    sample.lightSchedule.lightsOnHour,
    sample.lightSchedule.lightHours,
    sample.behaviour,
    sample.vigilanceState,
    sample.surface,
    sample.position.x,
    sample.position.y,
    sample.position.z,
    sample.speedMetresPerSecond,
    sample.energy,
    sample.hydration,
    sample.hunger,
    sample.thirst,
    sample.sleepPressure,
    sample.sleepDepth,
    sample.arousal,
    sample.circadianPhaseHours,
    sample.startle,
    sample.senses.odour,
    sample.senses.humidity,
    sample.recentOdour,
    sample.recentHumidity,
    sample.senses.touchingFood,
    sample.senses.touchingWater,
    sample.food?.x,
    sample.food?.y,
    sample.water?.x,
    sample.water?.y,
    ...transitionCells(sample.transitions),
  ];
}

const TRANSITION_COLUMNS = [
  ...RUN_COLUMNS,
  "transition",
  "from",
  "to",
  "trigger_level",
  "hazard",
  ...driverColumns(""),
  "p_next_minute",
  "vigilance_state",
  "sleep_pressure",
  "sleep_depth",
  "hunger",
  "thirst",
];

function transitionRow(run: RunExport, fired: FiredTransition): Cell[] {
  return [
    run.seed,
    run.modelVersion,
    fired.step,
    fired.step / run.stepsPerSecond,
    fired.transition,
    fired.from,
    fired.to,
    fired.triggerLevel,
    fired.hazard,
    ...contributionCells(fired.contributions),
    fired.fireProbabilityNextMinute,
    fired.vigilanceState,
    fired.sleepPressure,
    fired.sleepDepth,
    fired.hunger,
    fired.thirst,
  ];
}

const INTERVENTION_COLUMNS = [
  ...RUN_COLUMNS,
  "type",
  "source",
  "x",
  "y",
  "lights_on_h",
  "light_hours",
];

function interventionRow(run: RunExport, intervention: Intervention): Cell[] {
  const start = [
    run.seed,
    run.modelVersion,
    intervention.step,
    intervention.step / run.stepsPerSecond,
  ];
  switch (intervention.type) {
    case "disturb":
      return [...start, intervention.type, null, null, null, null, null];
    case "light-schedule": {
      const { lightsOnHour, lightHours } = intervention.lightSchedule;
      return [...start, intervention.type, null, null, null, lightsOnHour, lightHours];
    }
    case "move-source":
      return [
        ...start,
        intervention.type,
        intervention.source,
        intervention.place.x,
        intervention.place.y,
        null,
        null,
      ];
    case "remove-source":
    case "restore-source":
      return [...start, intervention.type, intervention.source, null, null, null, null];
  }
}

/** The CSV tables of an export. */
export function exportTables(run: RunExport): RunTables {
  return {
    samples: table(
      SAMPLE_COLUMNS,
      run.samples.map((sample) => sampleRow(run, sample)),
    ),
    transitions: table(
      TRANSITION_COLUMNS,
      run.firedTransitions.map((fired) => transitionRow(run, fired)),
    ),
    interventions: table(
      INTERVENTION_COLUMNS,
      run.interventions.map((intervention) => interventionRow(run, intervention)),
    ),
  };
}
