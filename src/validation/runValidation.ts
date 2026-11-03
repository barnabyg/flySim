import {
  DEFAULT_PARAMETERS,
  DEFAULT_STEPS_PER_SECOND,
  DRIVER_RELATIONSHIPS,
  MODEL_VERSION,
  PARAMETER_LABELS,
  type ModelParameters,
} from "../engine";
import { runInProcesses } from "../batch/processPool";
import { UnsupportedTargetError, assayFor, type Assay, type FlyRecording } from "./assays";
import {
  BOUT_SHAPE_XMIN_SECONDS,
  STEP_SIZE_TOLERANCE,
  boutKindShape,
  distributionDistance,
} from "./boutShapes";
import { disagreementOf, poolDisagreement } from "./disagreement";
import { countedTargets, type EvidencePack, type ValidationTarget } from "./evidencePack";
import type { InstrumentSettings } from "./instruments";
import type { ObserveJob } from "./observeProcess";
import {
  REPORT_FORMAT,
  REPORT_VERSION,
  type AssayBoutShapes,
  type AssayDisagreement,
  type ValidationReport,
} from "./report";
import { completeDurations } from "./measures";
import { scoreObservation, type ScoredActivity } from "./scoring";
import { targetBaselines } from "./targetBaselines";
import { evaluateTarget, type AssayedFly } from "./targets";

const OBSERVE_PROCESS = new URL("./observeProcess.ts", import.meta.url);

/** The seeds every assay runs, so the same command always gives the same report. */
export const VALIDATION_SEEDS: readonly number[] = Array.from({ length: 16 }, (_, i) => i + 1);

/**
 * The step sizes, besides the suite's own, that each assay scoring bouts also runs at, so bout
 * shapes are seen to hold whatever the step size. Half the default, so it costs least.
 */
export const OTHER_BOUT_SHAPE_STEPS_PER_SECOND: readonly number[] = [25];

/** The measures whose targets score bouts, so their assays are checked for bout shapes. */
const BOUT_MEASURES: ReadonlySet<string> = new Set([
  "inactivity-bout-duration-distribution",
  "activity-bout-duration-distribution",
]);

export interface ValidationOptions {
  readonly pack: EvidencePack;
  readonly seeds?: readonly number[];
  readonly stepsPerSecond?: number;
  /** The model's parameters, its defaults if not given, as when tuning tries others. */
  readonly parameters?: ModelParameters;
  /** The other step sizes that assays scoring bouts run at, for their bout shapes. */
  readonly otherBoutShapeStepsPerSecond?: readonly number[];
  /** How many flies run at once, each in its own process. */
  readonly jobs: number;
  /** When the report is made, which is all that differs between two reports of the same run. */
  readonly now?: Date;
  readonly onFlyFinished?: (finished: number, total: number) => void;
}

/** A study's flies, and every instrument any of its targets watches them with. */
interface Study {
  readonly assay: Assay;
  readonly instruments: InstrumentSettings[];
}

/** A target that can run, with its assay, and which study and instrument record it. */
interface Runnable {
  readonly target: ValidationTarget;
  readonly assay: Assay;
  readonly study: string;
  readonly instrument: number;
}

/** One fly's job: its study, by key, and what its process is sent. */
interface Job {
  readonly key: string;
  readonly job: ObserveJob;
}

/** A fly an assay recorded, scored. */
interface ScoredFly {
  readonly seed: number;
  readonly recording: FlyRecording;
  readonly scored: ScoredActivity;
}

/** A distinct Virtual Assay, a study, instrument and scoring rule, and the targets that use it. */
interface DistinctAssay {
  readonly first: Runnable;
  readonly targets: readonly ValidationTarget[];
}

function distinctAssays(runnable: readonly Runnable[]): DistinctAssay[] {
  const assays = new Map<string, { first: Runnable; targets: ValidationTarget[] }>();
  for (const each of runnable) {
    const key = JSON.stringify([each.study, each.instrument, each.assay.scoring]);
    const entry = assays.get(key) ?? { first: each, targets: [] };
    if (!entry.targets.includes(each.target)) entry.targets.push(each.target);
    assays.set(key, entry);
  }
  return [...assays.values()];
}

/** Each fly an assay recorded at a step size, scored, leaving out flies that died. */
function scoredFlies(
  assay: Runnable,
  jobs: readonly Job[],
  recorded: readonly FlyRecording[],
  stepsPerSecond: number,
): ScoredFly[] {
  return jobs.flatMap(({ key, job }, index) => {
    const recording = recorded[index];
    const observation = recording?.observations[assay.instrument];
    if (key !== assay.study || job.stepsPerSecond !== stepsPerSecond) return [];
    // A fly that died is left out, as a study leaves out its dead flies.
    if (!recording || !observation || observation.died) return [];
    return [
      { seed: job.seed, recording, scored: scoreObservation(observation, assay.assay.scoring) },
    ];
  });
}

/**
 * Runs every counted target's Virtual Assay for each seed, each fly in its own process, scores
 * what the assays observed, and judges the model against each target. Targets of the same study
 * watch the same flies, each with its own instrument, as a study recording with two at once did.
 */
export async function runValidation(options: ValidationOptions): Promise<ValidationReport> {
  const seeds = options.seeds ?? VALIDATION_SEEDS;
  const stepsPerSecond = options.stepsPerSecond ?? DEFAULT_STEPS_PER_SECOND;
  const parameters = options.parameters ?? DEFAULT_PARAMETERS;
  const skipped: { id: string; title: string; reason: string }[] = [];
  const studies = new Map<string, Study>();
  const runnable: Runnable[] = [];
  for (const target of countedTargets(options.pack)) {
    let assay;
    try {
      assay = assayFor(target);
    } catch (error) {
      if (!(error instanceof UnsupportedTargetError)) throw error;
      skipped.push({ id: target.id, title: target.title, reason: error.message });
      continue;
    }
    // The same flies, whatever each target calls their chamber.
    const studyKey = JSON.stringify({
      ...assay.study,
      chamber: { ...assay.study.chamber, name: "" },
    });
    const study = studies.get(studyKey) ?? { assay, instruments: [] };
    studies.set(studyKey, study);
    const instrumentKey = JSON.stringify(assay.instrument);
    let instrument = study.instruments.findIndex((each) => JSON.stringify(each) === instrumentKey);
    if (instrument === -1) instrument = study.instruments.push(assay.instrument) - 1;
    runnable.push({ target, assay, study: studyKey, instrument });
  }

  const boutAssays = distinctAssays(runnable).filter(({ targets }) =>
    targets.some((target) => BOUT_MEASURES.has(target.measure)),
  );
  const boutStudies = new Set(boutAssays.map(({ first }) => first.study));
  const otherSteps = options.otherBoutShapeStepsPerSecond ?? OTHER_BOUT_SHAPE_STEPS_PER_SECOND;
  const jobs: Job[] = [...studies].flatMap(([key, study]) =>
    [stepsPerSecond, ...(boutStudies.has(key) ? otherSteps : [])].flatMap((steps) =>
      seeds.map((seed) => ({
        key,
        job: {
          study: study.assay.study,
          instruments: study.instruments,
          seed,
          stepsPerSecond: steps,
          parameters,
        },
      })),
    ),
  );
  const recorded = await runInProcesses<FlyRecording>(
    OBSERVE_PROCESS,
    jobs.map(({ job }): ObserveJob => job),
    options.jobs,
    (_, finished) => options.onFlyFinished?.(finished, jobs.length),
  );

  const targets = runnable.flatMap((each) => {
    const { target, assay } = each;
    const flies: AssayedFly[] = scoredFlies(each, jobs, recorded, stepsPerSecond).flatMap(
      ({ seed, recording, scored }) => {
        const observation = recording.observations[each.instrument];
        return observation ? [{ seed, observation, scored }] : [];
      },
    );
    try {
      return evaluateTarget(target, flies, { lightHours: assay.study.lightSchedule.lightHours });
    } catch (error) {
      if (!(error instanceof UnsupportedTargetError)) throw error;
      skipped.push({ id: target.id, title: target.title, reason: error.message });
      return [];
    }
  });

  const disagreement = distinctAssays(runnable).map((assay) =>
    assayDisagreement(assay, scoredFlies(assay.first, jobs, recorded, stepsPerSecond)),
  );
  const baselines = runnable.flatMap((each) =>
    targetBaselines(
      each.target,
      scoredFlies(each, jobs, recorded, stepsPerSecond),
      { lightHours: each.assay.study.lightSchedule.lightHours },
      binSecondsOf(each.assay),
    ),
  );
  const boutShapes = boutAssays.map((assay) =>
    assayBoutShapes(assay, [stepsPerSecond, ...otherSteps], (steps) =>
      scoredFlies(assay.first, jobs, recorded, steps),
    ),
  );

  return {
    format: REPORT_FORMAT,
    version: REPORT_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    modelVersion: MODEL_VERSION,
    parameters,
    stepsPerSecond,
    seeds,
    relationships: { parameters: PARAMETER_LABELS, drivers: DRIVER_RELATIONSHIPS },
    targets,
    skipped,
    disagreement,
    boutShapes,
    baselines,
  };
}

function seconds(value: number): string {
  return `${String(value)} s`;
}

/** What a Virtual Assay is, as its study and instrument, such as "Xu 2021: beam monitor, 60-s bins". */
function assayTitle(target: ValidationTarget, assay: Assay): string {
  // Ids start with the first author and the year, as in xu-2021-male-scored-sleep-profile.
  const [author = "", year = ""] = target.id.split("-");
  const name = `${author.charAt(0).toUpperCase()}${author.slice(1)}`;
  const study = /^\d{4}$/.test(year) ? `${name} ${year}` : name;
  const { instrument } = assay;
  const method =
    instrument.kind === "beam-crossing"
      ? `beam monitor, ${seconds(instrument.binSeconds)} bins`
      : `video, a frame every ${seconds(instrument.frameSeconds)}, ${
          instrument.groomingCountsAsMovement
            ? "grooming counts as movement"
            : "grooming doesn't count"
        }`;
  return `${study}: ${method}`;
}

/** Scoring Disagreement for a distinct Virtual Assay, however many targets use it. */
function assayDisagreement(
  { first, targets }: DistinctAssay,
  flies: readonly ScoredFly[],
): AssayDisagreement {
  const perFly = flies.map(({ seed, recording, scored }) => ({
    seed,
    ...disagreementOf(scored, recording.vigilance, first.assay.scoring),
  }));
  return {
    id: targets.map((target) => target.id).join("+"),
    title: assayTitle(first.target, first.assay),
    assay: first.target.assay.kind,
    targets: targets.map((target) => target.id),
    sleepThresholdMinutes: first.assay.scoring.sleepThresholdMinutes,
    perFly,
    pooled: perFly.length === 0 ? null : poolDisagreement(perFly),
  };
}

/** The width of the bins an assay scores bouts in. */
function binSecondsOf({ instrument }: Assay): number {
  return instrument.kind === "beam-crossing" ? instrument.binSeconds : instrument.windowSeconds;
}

/**
 * The shapes of an assay's Inactivity and Activity Bouts at each step size, and how closely the
 * other step sizes' bouts agree with the first's.
 */
function assayBoutShapes(
  { first, targets }: DistinctAssay,
  stepSizes: readonly number[],
  fliesAt: (stepsPerSecond: number) => readonly ScoredFly[],
): AssayBoutShapes {
  const durations = stepSizes.map((stepsPerSecond) => {
    const flies = fliesAt(stepsPerSecond);
    return {
      stepsPerSecond,
      inactivity: flies.map(({ seed, scored }) => ({
        seed,
        durations: completeDurations(scored.inactivityBouts),
      })),
      activity: flies.map(({ seed, scored }) => ({
        seed,
        durations: completeDurations(scored.activityBouts),
      })),
    };
  });
  const bin = binSecondsOf(first.assay);
  const [reference, ...others] = durations;
  const agreement = others.flatMap((other) =>
    (["inactivity", "activity"] as const).map((bouts) => {
      const distance = distributionDistance(
        reference?.[bouts].flatMap((fly) => fly.durations) ?? [],
        other[bouts].flatMap((fly) => fly.durations),
        BOUT_SHAPE_XMIN_SECONDS,
      );
      return {
        bouts,
        stepsPerSecond: [reference?.stepsPerSecond ?? 0, other.stepsPerSecond] as const,
        distance,
        tolerance: STEP_SIZE_TOLERANCE,
        pass: distance !== null && distance <= STEP_SIZE_TOLERANCE,
      };
    }),
  );
  return {
    id: targets.map((target) => target.id).join("+"),
    title: assayTitle(first.target, first.assay),
    targets: targets.map((target) => target.id),
    binSeconds: bin,
    stepSizes: durations.map((each) => ({
      stepsPerSecond: each.stepsPerSecond,
      kinds: [
        boutKindShape("inactivity", each.inactivity, bin),
        boutKindShape("activity", each.activity, bin),
      ],
    })),
    agreement,
  };
}
