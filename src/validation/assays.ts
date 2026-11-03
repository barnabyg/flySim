import {
  DEFAULT_LIGHT_SCHEDULE,
  createSimulationRun,
  type LightSchedule,
  type ModelParameters,
  type SimulationSetup,
} from "../engine";
import type { ValidationTarget } from "./evidencePack";
import { vigilanceRecord, type VigilanceRecord } from "./disagreement";
import { observeRun, type InstrumentSettings, type Observation } from "./instruments";
import type { ScoringRule } from "./scoring";

/**
 * How long every run settles before its instruments record, whatever its study's own acclimation.
 * A run starts from set reserves, Sleep Pressure and clock rather than from a fly that has lived in
 * its tube, so it needs some, even for a study that recorded at once, as its flies had already
 * settled elsewhere. More only takes longer, as the model doesn't age. A day is a calibration,
 * Provisional, as nothing yet tests how long the model takes to settle.
 */
export const SIMULATED_ACCLIMATION_HOURS = 24;

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

/** How a simulated fly is run: its step size and model parameters, each the model's default if not given. */
export interface FlyRunOptions {
  readonly stepsPerSecond?: number;
  readonly parameters?: ModelParameters;
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
  { stepsPerSecond, parameters }: FlyRunOptions = {},
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
    ...(parameters !== undefined && { parameters }),
  };
}

/** What a study's instruments recorded of one fly, and beside it, what they couldn't see. */
export interface FlyRecording {
  /** One per instrument. Scoring sees only these. */
  readonly observations: Observation[];
  /** The fly's true Vigilance State over the same span, for Scoring Disagreement alone. */
  readonly vigilance: VigilanceRecord;
}

/**
 * Runs one fly through a study, and returns what each instrument recorded after acclimation, as
 * the study recorded its flies with each at once, and the true Vigilance State over that time.
 */
export function observeFly(
  study: StudySetup,
  instruments: readonly InstrumentSettings[],
  seed: number,
  options: FlyRunOptions = {},
): FlyRecording {
  const run = createSimulationRun(assaySetup(study, seed, options));
  run.advanceSeconds(study.acclimationHours * 3600);
  const start = run.current();
  const firedBefore = run.firedTransitions.length;
  const observations = observeRun(
    run,
    instruments,
    (study.acclimationHours + study.recordedDays * 24) * 3600,
  );
  const vigilance = vigilanceRecord(
    start.vigilanceState,
    run.firedTransitions.slice(firedBefore),
    start.timeSeconds,
    run.current().timeSeconds,
  );
  return { observations, vigilance };
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
  /**
   * How far the food reaches into the chamber from its end, which the fly can't walk on. The
   * simulated chamber is shorter by this much, and the pack's beam positions, measured from the
   * chamber's end, move with it.
   */
  readonly foodLengthMm?: number;
  readonly reason: string;
}

/** Xu 2021's food fills 15 to 20 mm of its channel's length. */
const XU_FOOD_LENGTH_MM = 17.5;

/** Cascallares 2018's 1 cm³ of food fills its 10 × 7 mm track's sealed end to about 14 mm. */
const CASCALLARES_FOOD_LENGTH_MM = 14;

export const CALIBRATIONS: Readonly<Record<string, AssayCalibration>> = {
  "xu-2021-inactivity-bouts-power-law": {
    movementThresholdMetres: 0.0001,
    groomingCountsAsMovement: false,
    minInactivitySeconds: 1,
    foodLengthMm: XU_FOOD_LENGTH_MM,
    reason:
      "Xu 2021 tracks the centroid, and any change of location of a pixel is movement, but doesn't give the pixel's size. 0.1 mm is below any step the fly walks in a frame, so any walking shows. A centroid doesn't move when the fly grooms in place. Its Methods score only a stay of more than 1 s as an Inactivity Bout. Its food fills 15 to 20 mm of the channel.",
  },
  "xu-2021-male-scored-sleep-profile": {
    foodLengthMm: XU_FOOD_LENGTH_MM,
    reason:
      "Xu 2021's food fills 15 to 20 mm of the channel, so its virtual beam, at the middle of where the fly walks, is 47.75 mm from the channel's end.",
  },
  "cascallares-2018-activity-bouts-exponential": {
    foodLengthMm: CASCALLARES_FOOD_LENGTH_MM,
    reason: "About 1 cm³ of food fills the sealed end of the 10 × 7 mm track.",
  },
  "cascallares-2018-quiescence-power-law": {
    foodLengthMm: CASCALLARES_FOOD_LENGTH_MM,
    reason: "About 1 cm³ of food fills the sealed end of the 10 × 7 mm track.",
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
  const foodMm = calibration?.foodLengthMm ?? 0;
  const lengthMetres = (assay.chamber.lengthMm - foodMm) / 1000;
  const study: StudySetup = {
    chamber: {
      name: assay.chamber.description,
      lengthMetres,
      widthMetres: assay.chamber.widthMm / 1000,
      heightMetres: assay.chamber.heightMm / 1000,
    },
    lightSchedule: { ...DEFAULT_LIGHT_SCHEDULE, lightHours: fly.lightSchedule.lightHours },
    acclimationHours: SIMULATED_ACCLIMATION_HOURS,
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
          beamPositionsMetres: assay.beamPositionsMm?.map((mm) => (mm - foodMm) / 1000) ?? [
            lengthMetres / 2,
          ],
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
