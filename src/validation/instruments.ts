import type { Position, SimulationRun } from "../engine";

/** An infrared beam monitor: each beam across the tube counts the fly's crossings. */
export interface BeamCrossingSettings {
  readonly kind: "beam-crossing";
  /** Where each beam crosses the chamber, in metres along it from the food end. */
  readonly beamPositionsMetres: readonly number[];
  readonly binSeconds: number;
}

/**
 * A camera tracking the fly. It compares each frame with the one before, and a window of frames
 * shows movement if any comparison in it does.
 */
export interface VideoTrackingSettings {
  readonly kind: "video-tracking";
  readonly frameSeconds: number;
  /** How many seconds of frames are scored together, a whole number of frames. */
  readonly windowSeconds: number;
  /** The least change in the fly's position between frames that shows as movement. */
  readonly movementThresholdMetres: number;
  /**
   * Whether the camera sees movement in place, such as grooming legs, as well as a change of
   * position, as a method that compares pixels rather than positions does.
   */
  readonly groomingCountsAsMovement: boolean;
}

export type InstrumentSettings = BeamCrossingSettings | VideoTrackingSettings;

/** What a beam monitor records: the crossings in each bin. */
export interface BeamObservation {
  readonly kind: "beam-crossing";
  readonly binSeconds: number;
  /** Simulated seconds from the start of the run to the start of the first bin. */
  readonly startSeconds: number;
  /** Beam crossings in each bin. */
  readonly counts: readonly number[];
  /** Whether the fly died before the record ended, as a lab would see. Its bins then stop. */
  readonly died: boolean;
}

/**
 * What a camera records: whether each window showed movement, as runs of windows that all did or
 * all didn't, which keeps a record of many frames small.
 */
export interface VideoObservation {
  readonly kind: "video-tracking";
  readonly windowSeconds: number;
  readonly startSeconds: number;
  /** Each run: whether its windows showed movement, and how many windows long it is. */
  readonly runs: readonly (readonly [moved: boolean, windows: number])[];
  readonly died: boolean;
}

/**
 * What an instrument recorded of one fly. It is all the instrument's scoring can see: no Vigilance
 * State, behaviour or other hidden state is in it.
 */
export type Observation = BeamObservation | VideoObservation;

/** Watches a run step by step and builds one instrument's record. */
interface Recorder {
  step(position: Position, moving: boolean): void;
  finish(died: boolean): Observation;
}

function wholeSteps(seconds: number, stepsPerSecond: number, what: string): number {
  const steps = Math.round(seconds * stepsPerSecond);
  if (!(steps >= 1 && Math.abs(steps - seconds * stepsPerSecond) < 1e-9)) {
    throw new Error(`${what} of ${seconds} s isn't a whole number of steps`);
  }
  return steps;
}

function beamRecorder(
  settings: BeamCrossingSettings,
  stepsPerSecond: number,
  start: Position,
  startSeconds: number,
): Recorder {
  const stepsPerBin = wholeSteps(settings.binSeconds, stepsPerSecond, "A bin");
  const counts: number[] = [];
  let x = start.x;
  let count = 0;
  let steps = 0;
  return {
    step: (position) => {
      // A fly in the beam doesn't cross it, so grooming or standing in place never counts.
      for (const beam of settings.beamPositionsMetres) {
        if (x < beam !== position.x < beam) count += 1;
      }
      x = position.x;
      if (++steps % stepsPerBin === 0) {
        counts.push(count);
        count = 0;
      }
    },
    finish: (died) => ({
      kind: "beam-crossing",
      binSeconds: settings.binSeconds,
      startSeconds,
      counts,
      died,
    }),
  };
}

function videoRecorder(
  settings: VideoTrackingSettings,
  stepsPerSecond: number,
  start: Position,
  startSeconds: number,
): Recorder {
  const stepsPerFrame = wholeSteps(settings.frameSeconds, stepsPerSecond, "A frame");
  const stepsPerWindow = wholeSteps(settings.windowSeconds, stepsPerSecond, "A window");
  if (stepsPerWindow % stepsPerFrame !== 0) {
    throw new Error("A window must be a whole number of frames");
  }
  const runs: [boolean, number][] = [];
  let lastFrame = start;
  // Whether the fly was moving in place in the last frame, which a pixel comparison would show.
  let lastFrameMoving = false;
  let windowMoved = false;
  let steps = 0;
  return {
    step: (position, moving) => {
      steps += 1;
      if (steps % stepsPerFrame === 0) {
        const shift = Math.hypot(
          position.x - lastFrame.x,
          position.y - lastFrame.y,
          position.z - lastFrame.z,
        );
        if (
          shift >= settings.movementThresholdMetres ||
          (settings.groomingCountsAsMovement && (moving || lastFrameMoving))
        ) {
          windowMoved = true;
        }
        lastFrame = position;
        lastFrameMoving = moving;
      }
      if (steps % stepsPerWindow === 0) {
        const last = runs.at(-1);
        if (last?.[0] === windowMoved) last[1] += 1;
        else runs.push([windowMoved, 1]);
        windowMoved = false;
      }
    },
    finish: (died) => ({
      kind: "video-tracking",
      windowSeconds: settings.windowSeconds,
      startSeconds,
      runs,
      died,
    }),
  };
}

/**
 * Watches a run with each instrument from its current step up to the given simulated second, all
 * in one pass, and returns what each recorded. A fly that dies ends every record there.
 */
export function observeRun(
  run: SimulationRun,
  instruments: readonly InstrumentSettings[],
  untilSeconds: number,
): Observation[] {
  const { stepsPerSecond } = run.record();
  const startStep = run.current().step;
  const startSeconds = startStep / stepsPerSecond;
  const start = run.pose().position;
  const recorders = instruments.map((settings) =>
    settings.kind === "beam-crossing"
      ? beamRecorder(settings, stepsPerSecond, start, startSeconds)
      : videoRecorder(settings, stepsPerSecond, start, startSeconds),
  );
  const lastStep = Math.round(untilSeconds * stepsPerSecond);
  let died = false;
  for (let step = startStep + 1; step <= lastStep && !died; step++) {
    run.advanceSteps(1);
    // Checked once a simulated second, as a whole sample is slow to make every step.
    if (step % stepsPerSecond === 0) died = run.current().death !== null;
    const { position } = run.pose();
    const moving = run.moving();
    for (const recorder of recorders) recorder.step(position, moving);
  }
  return recorders.map((recorder) => recorder.finish(died));
}
