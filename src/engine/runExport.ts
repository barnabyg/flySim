import type { LightSchedule } from "./lightSchedule";
import type { Behaviour } from "./model";
import type { RoomSetup, Surface } from "./movement";
import type { ModelParameters } from "./parameters";
import type { FloorPlace } from "./roomContents";
import {
  MODEL_VERSION,
  createSimulationRun,
  replaySetup,
  type Death,
  type FiredTransition,
  type Intervention,
  type RunRecord,
  type RunSample,
} from "./simulationRun";

/** What every export says it is, so that any other file can be told apart from one. */
export const EXPORT_FORMAT = "fly-sim-run";

/**
 * The version of the export's layout, in JSON and in CSV. Files written at any released version
 * must stay readable, or a later version must come with a way to migrate them.
 */
export const RECORD_FORMAT_VERSION = 1;

const READABLE_RECORD_FORMAT_VERSIONS: readonly number[] = [1];

export const DEFAULT_SAMPLE_INTERVAL_SECONDS = 10;

/**
 * A Run Record in a form that can be saved as JSON and read anywhere. The file alone is enough to
 * trace the run and to reproduce it, in full detail, from its setup and Interventions.
 */
export interface RunExport {
  readonly format: typeof EXPORT_FORMAT;
  readonly recordFormatVersion: number;
  /** The model that made the run. Another model version might not reproduce it. */
  readonly modelVersion: string;
  readonly seed: number;
  /** Which random stream drew Trigger Levels. */
  readonly triggerStream: number;
  readonly stepsPerSecond: number;
  readonly room: RoomSetup;
  /** The full model parameters, including how full the reserves started. */
  readonly parameters: ModelParameters;
  /** Where the food started, or null if there was none. */
  readonly food: FloorPlace | null;
  /** Where the water started, or null if there was none. */
  readonly water: FloorPlace | null;
  /** The schedule the run started with. Later ones are among its Interventions. */
  readonly lightSchedule: LightSchedule;
  /** The step the run had reached, which a replay advances to. */
  readonly step: number;
  /** How the fly died, or null if it was alive. */
  readonly death: Death | null;
  /** Every Intervention, never thinned. */
  readonly interventions: readonly Intervention[];
  /** Every fired transition, never thinned, so bout durations come out exact. */
  readonly firedTransitions: readonly FiredTransition[];
  /** Covers the whole run. */
  readonly timeOnSurfaceSeconds: Readonly<Record<Surface, number>>;
  /** Covers the whole run. */
  readonly timeInBehaviourSeconds: Readonly<Record<Behaviour, number>>;
  /** The samples are this many simulated seconds apart. */
  readonly sampleIntervalSeconds: number;
  /**
   * The earliest sample the run still held: 0 unless it had dropped older ones, as a long viewer
   * run does. The setup and Interventions still cover the whole run.
   */
  readonly samplesStartSeconds: number;
  /** Full detail, at whole multiples of the interval from the start of the run. */
  readonly samples: readonly RunSample[];
}

/** Why a file can't be replayed as it is. */
export class RunExportError extends Error {
  override readonly name = "RunExportError";
}

export interface RunExportReading {
  readonly run: RunExport;
  /** Whether this model made it. A run from another model version might not reproduce. */
  readonly sameModelVersion: boolean;
}

function validateSampleInterval(seconds: number): void {
  if (!(Number.isInteger(seconds) && seconds >= 1)) {
    throw new Error(
      `Samples can't be exported every ${seconds} s, only every whole second or more`,
    );
  }
}

/** Converts a Run Record for export, keeping samples every interval and everything else. */
export function exportRun(
  record: RunRecord,
  sampleIntervalSeconds: number = DEFAULT_SAMPLE_INTERVAL_SECONDS,
): RunExport {
  validateSampleInterval(sampleIntervalSeconds);
  const stepsApart = sampleIntervalSeconds * record.stepsPerSecond;
  return {
    format: EXPORT_FORMAT,
    recordFormatVersion: RECORD_FORMAT_VERSION,
    modelVersion: record.modelVersion,
    seed: record.seed,
    triggerStream: record.triggerStream,
    stepsPerSecond: record.stepsPerSecond,
    room: record.room,
    parameters: record.parameters,
    food: record.food,
    water: record.water,
    lightSchedule: record.lightSchedule,
    step: record.step,
    death: record.death,
    interventions: record.interventions,
    firedTransitions: record.firedTransitions,
    timeOnSurfaceSeconds: record.timeOnSurfaceSeconds,
    timeInBehaviourSeconds: record.timeInBehaviourSeconds,
    sampleIntervalSeconds,
    samplesStartSeconds: record.samples[0]?.timeSeconds ?? 0,
    samples: record.samples.filter((sample) => sample.step % stepsApart === 0),
  };
}

/** A name for an export's file, with its seed and how far the run had got in simulated seconds. */
export function exportFileName(run: RunExport, part: string, extension: string): string {
  const seconds = Math.floor(run.step / run.stepsPerSecond);
  return `fly-sim-seed-${run.seed}-at-${seconds}s${part ? `-${part}` : ""}.${extension}`;
}

const NOT_AN_EXPORT = "This file isn't an exported fly simulator run.";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads an export's JSON, ready to replay. It refuses anything that isn't an export, or is in a
 * record format this version can't read.
 */
export function readRunExport(json: string): RunExportReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new RunExportError(NOT_AN_EXPORT);
  }
  if (!isObject(parsed) || parsed["format"] !== EXPORT_FORMAT) {
    throw new RunExportError(NOT_AN_EXPORT);
  }
  const version = parsed["recordFormatVersion"];
  if (typeof version !== "number" || !READABLE_RECORD_FORMAT_VERSIONS.includes(version)) {
    throw new RunExportError(
      `This file's record format version is ${String(version)}, which this version of the simulator can't read. It reads version ${READABLE_RECORD_FORMAT_VERSIONS.join(" and ")}.`,
    );
  }
  const run = parsed as unknown as RunExport;
  const wellFormed =
    typeof run.modelVersion === "string" &&
    Number.isInteger(run.seed) &&
    Number.isInteger(run.triggerStream) &&
    Number.isInteger(run.step) &&
    isObject(run.room) &&
    isObject(run.parameters) &&
    isObject(run.lightSchedule) &&
    Array.isArray(run.interventions);
  if (!wellFormed) throw new RunExportError(`${NOT_AN_EXPORT} Its setup is incomplete.`);
  try {
    // Setting the run up checks its setup and Interventions.
    createSimulationRun(replaySetup(run));
  } catch (error) {
    throw new RunExportError(`${NOT_AN_EXPORT} ${error instanceof Error ? error.message : ""}.`);
  }
  return { run, sameModelVersion: run.modelVersion === MODEL_VERSION };
}
