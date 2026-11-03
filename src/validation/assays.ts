import {
  DEFAULT_LIGHT_SCHEDULE,
  createSimulationRun,
  type LightSchedule,
  type SimulationSetup,
} from "../engine";
import type { ValidationTarget } from "./evidencePack";
import { observeRun, type InstrumentSettings, type Observation } from "./instruments";
import type { ScoringRule } from "./scoring";

/**
 * The most acclimation a run simulates. A study may let its flies settle for days, often to bring
 * them to an age, but the model doesn't age and its state settles within a day, so more would only
 * take longer.
 */
export const MAX_ACCLIMATION_HOURS = 24;

/** A food plug fills the chamber's end, and the fly touches it from any surface this close. */
const PLUG_REACH_METRES = 0.004;

/** A Chamber's shape, with the food end at x = 0. */
export interface ChamberGeometry {
  readonly name: string;
  readonly lengthMetres: number;
  readonly widthMetres: number;
  readonly heightMetres: number;
}

/**
 * How a study kept its flies: the chamber, the light, how long they settled before recording
 * began, and how long recording lasted. Instruments that recorded the same flies share it.
 */
export interface StudySetup {
  readonly chamber: ChamberGeometry;
  readonly lightSchedule: LightSchedule;
  readonly acclimationHours: number;
  readonly recordedDays: number;
}

/** A Virtual Assay: a study's setup, the instrument it measured with and how it scored. */
export interface Assay {
  readonly study: StudySetup;
  readonly instrument: InstrumentSettings;
  readonly scoring: ScoringRule;
}

/** The standard beam monitor: a 65 mm tube, 5 mm across, with one beam across its middle. */
export const ACTIVITY_MONITOR: Assay = {
  study: {
    chamber: {
      name: "activity-monitor tube",
      lengthMetres: 0.065,
      widthMetres: 0.005,
      heightMetres: 0.005,
    },
    lightSchedule: DEFAULT_LIGHT_SCHEDULE,
    acclimationHours: 24,
    recordedDays: 2,
  },
  instrument: { kind: "beam-crossing", beamPositionsMetres: [0.0325], binSeconds: 60 },
  scoring: { sleepThresholdMinutes: 5 },
};

/**
 * The Simulation Run of the Reference Fly in a study's chamber: flight is impossible, and a food
 * plug at one end gives both food and water.
 */
export function assaySetup(
  study: StudySetup,
  seed: number,
  stepsPerSecond?: number,
): SimulationSetup {
  const { chamber } = study;
  const plug = { x: 0, y: chamber.widthMetres / 2 };
  return {
    seed,
    room: {
      widthMetres: chamber.lengthMetres,
      depthMetres: chamber.widthMetres,
      heightMetres: chamber.heightMetres,
    },
    chamber: { name: chamber.name, flightPossible: false, sourceReachMetres: PLUG_REACH_METRES },
    food: plug,
    water: plug,
    lightSchedule: study.lightSchedule,
    // Only the instruments' records are kept, so the run holds just its latest sample.
    maxRecordedSamples: 1,
    ...(stepsPerSecond !== undefined && { stepsPerSecond }),
  };
}

/**
 * Runs one fly through a study, and returns what each instrument recorded after acclimation, as
 * the study recorded its flies with each at once.
 */
export function observeFly(
  study: StudySetup,
  instruments: readonly InstrumentSettings[],
  seed: number,
  stepsPerSecond?: number,
): Observation[] {
  const run = createSimulationRun(assaySetup(study, seed, stepsPerSecond));
  run.advanceSeconds(study.acclimationHours * 3600);
  return observeRun(run, instruments, (study.acclimationHours + study.recordedDays * 24) * 3600);
}

/** Thrown for a target the validation suite has no way to measure or judge yet. */
export class UnsupportedTargetError extends Error {
  override readonly name = "UnsupportedTargetError";
}

/**
 * Choices a source left open that a Virtual Assay can't, made here and recorded with a reason, so
 * the assay can run. Each is a calibration, Provisional until a source settles it.
 */
export interface AssayCalibration {
  /** The movement threshold, in metres, when the source gives it in pixels or its own units. */
  readonly movementThresholdMetres?: number;
  /** Whether grooming in place counts as movement, when the source doesn't say. */
  readonly groomingCountsAsMovement?: boolean;
  readonly minInactivitySeconds?: number;
  readonly reason: string;
}

export const CALIBRATIONS: Readonly<Record<string, AssayCalibration>> = {
  "xu-2021-inactivity-bouts-power-law": {
    movementThresholdMetres: 0.0001,
    groomingCountsAsMovement: false,
    minInactivitySeconds: 1,
    reason:
      "Xu 2021 tracks the centroid, and any change of location of a pixel is movement, but doesn't give the pixel's size. 0.1 mm is below any step the fly walks in a frame, so any walking shows. A centroid doesn't move when the fly grooms in place. Its Methods count only a stay of more than 1 s as a rest.",
  },
  "geissmann-2019-daily-scored-sleep-ethoscope": {
    movementThresholdMetres: 0.001,
    reason:
      "The ethoscope's velocity threshold is in its own units, defined in a supplement that wasn't read. 1 mm between frames a second apart is about three times its median tracking error of 0.3 mm. Its micromovement detection counts grooming in place as movement, as the source says.",
  },
};

/** A pack's threshold in metres, or the calibration's when the source gives it in other units. */
function thresholdMetres(target: ValidationTarget, calibration?: AssayCalibration): number {
  if (calibration?.movementThresholdMetres !== undefined) {
    return calibration.movementThresholdMetres;
  }
  const threshold = target.assay.movementThreshold;
  if (threshold?.unit !== "mm") {
    throw new UnsupportedTargetError(
      `Its movement threshold isn't in mm, and the suite has no calibration for it`,
    );
  }
  return threshold.value / 1000;
}

/** A target's Virtual Assay, set up as its study set up its own. */
export function assayFor(target: ValidationTarget): Assay {
  const { assay, fly } = target;
  const calibration = CALIBRATIONS[target.id];
  const lengthMetres = assay.chamber.lengthMm / 1000;
  const study: StudySetup = {
    chamber: {
      name: assay.chamber.description,
      lengthMetres,
      widthMetres: assay.chamber.widthMm / 1000,
      heightMetres: assay.chamber.heightMm / 1000,
    },
    lightSchedule: { ...DEFAULT_LIGHT_SCHEDULE, lightHours: fly.lightSchedule.lightHours },
    acclimationHours: Math.min(assay.acclimationHours, MAX_ACCLIMATION_HOURS),
    recordedDays: assay.recordedDays,
  };
  const scoring: ScoringRule = {
    sleepThresholdMinutes: assay.sleepThresholdMinutes,
    ...(calibration?.minInactivitySeconds !== undefined && {
      minInactivitySeconds: calibration.minInactivitySeconds,
    }),
  };
  switch (assay.kind) {
    case "beam-crossing":
      return {
        study,
        instrument: {
          kind: "beam-crossing",
          beamPositionsMetres: assay.beamPositionsMm?.map((mm) => mm / 1000) ?? [lengthMetres / 2],
          binSeconds: assay.binSeconds,
        },
        scoring,
      };
    case "video-tracking": {
      const grooming = calibration?.groomingCountsAsMovement ?? assay.groomingCountsAsMovement;
      if (grooming === null) {
        throw new UnsupportedTargetError(
          "Its source doesn't say whether grooming counts as movement, and the suite has no calibration for it",
        );
      }
      return {
        study,
        instrument: {
          kind: "video-tracking",
          frameSeconds: assay.samplingIntervalSeconds,
          windowSeconds: assay.binSeconds,
          movementThresholdMetres: thresholdMetres(target, calibration),
          groomingCountsAsMovement: grooming,
        },
        scoring,
      };
    }
    default:
      throw new UnsupportedTargetError(`There is no ${assay.kind} Virtual Assay yet`);
  }
}
