import {
  DEFAULT_LIGHT_SCHEDULE,
  createSimulationRun,
  type Chamber,
  type LightSchedule,
  type SimulationSetup,
} from "../engine";
import { recordBeamCrossings, type BeamObservation } from "./beamMonitor";

/** A food plug fills the tube's end, and the fly touches it from any surface this close. */
const PLUG_REACH_METRES = 0.004;

/** A Chamber's shape, with the food end at x = 0. */
export interface ChamberGeometry {
  readonly name: string;
  readonly lengthMetres: number;
  readonly widthMetres: number;
  readonly heightMetres: number;
}

/**
 * A beam-crossing activity monitor, as a study set it up: its tube, its beams, how it bins
 * crossings, how it scores them, and how long the flies settled before recording began.
 */
export interface BeamCrossingAssay {
  readonly kind: "beam-crossing";
  readonly chamber: ChamberGeometry;
  /** Where each beam crosses the tube, in metres from the food end. */
  readonly beamPositionsMetres: readonly number[];
  readonly binSeconds: number;
  /** An Inactivity Bout at least this long is Scored Sleep. */
  readonly sleepThresholdMinutes: number;
  /** Discarded before recording, as the study let its flies settle. */
  readonly acclimationHours: number;
  readonly recordedDays: number;
  readonly lightSchedule: LightSchedule;
}

/** The standard monitor: a 65 mm tube, 5 mm across, with one beam across its middle. */
export const ACTIVITY_MONITOR: BeamCrossingAssay = {
  kind: "beam-crossing",
  chamber: {
    name: "activity-monitor tube",
    lengthMetres: 0.065,
    widthMetres: 0.005,
    heightMetres: 0.005,
  },
  beamPositionsMetres: [0.0325],
  binSeconds: 60,
  sleepThresholdMinutes: 5,
  acclimationHours: 24,
  recordedDays: 2,
  lightSchedule: DEFAULT_LIGHT_SCHEDULE,
};

/**
 * The Simulation Run of the Reference Fly in the assay's tube: flight is impossible, and a food
 * plug at one end gives both food and water.
 */
export function assaySetup(
  assay: BeamCrossingAssay,
  seed: number,
  stepsPerSecond?: number,
): SimulationSetup {
  const { chamber } = assay;
  const plug = { x: 0, y: chamber.widthMetres / 2 };
  const settings: Chamber = {
    name: chamber.name,
    flightPossible: false,
    sourceReachMetres: PLUG_REACH_METRES,
  };
  return {
    seed,
    room: {
      widthMetres: chamber.lengthMetres,
      depthMetres: chamber.widthMetres,
      heightMetres: chamber.heightMetres,
    },
    chamber: settings,
    food: plug,
    water: plug,
    lightSchedule: assay.lightSchedule,
    // Only the monitor's record is kept, so the run holds just its latest sample.
    maxRecordedSamples: 1,
    ...(stepsPerSecond !== undefined && { stepsPerSecond }),
  };
}

/** Runs one fly through the assay, and returns what the monitor recorded after acclimation. */
export function observeFly(
  assay: BeamCrossingAssay,
  seed: number,
  stepsPerSecond?: number,
): BeamObservation {
  const run = createSimulationRun(assaySetup(assay, seed, stepsPerSecond));
  run.advanceSeconds(assay.acclimationHours * 3600);
  return recordBeamCrossings(
    run,
    { beamPositionsMetres: assay.beamPositionsMetres, binSeconds: assay.binSeconds },
    (assay.acclimationHours + assay.recordedDays * 24) * 3600,
  );
}
