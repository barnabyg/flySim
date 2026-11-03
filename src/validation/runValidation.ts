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
import { disagreementOf, poolDisagreement } from "./disagreement";
import { countedTargets, type EvidencePack, type ValidationTarget } from "./evidencePack";
import type { InstrumentSettings } from "./instruments";
import type { ObserveJob } from "./observeProcess";
import {
  REPORT_FORMAT,
  REPORT_VERSION,
  type AssayDisagreement,
  type ValidationReport,
} from "./report";
import { scoreObservation } from "./scoring";
import { evaluateTarget, type AssayedFly } from "./targets";

const OBSERVE_PROCESS = new URL("./observeProcess.ts", import.meta.url);

/** The seeds every assay runs, so the same command always gives the same report. */
export const VALIDATION_SEEDS: readonly number[] = Array.from({ length: 16 }, (_, i) => i + 1);

export interface ValidationOptions {
  readonly pack: EvidencePack;
  readonly seeds?: readonly number[];
  readonly stepsPerSecond?: number;
  /** The model's parameters, its defaults if not given, as when tuning tries others. */
  readonly parameters?: ModelParameters;
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
  const runnable: { target: ValidationTarget; assay: Assay; study: string; instrument: number }[] =
    [];
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

  const jobs = [...studies].flatMap(([key, study]) =>
    seeds.map((seed) => ({
      key,
      job: {
        study: study.assay.study,
        instruments: study.instruments,
        seed,
        stepsPerSecond,
        parameters,
      },
    })),
  );
  const recorded = await runInProcesses<FlyRecording>(
    OBSERVE_PROCESS,
    jobs.map(({ job }): ObserveJob => job),
    options.jobs,
    (_, finished) => options.onFlyFinished?.(finished, jobs.length),
  );

  const targets = runnable.flatMap(({ target, assay, study, instrument }) => {
    const flies: AssayedFly[] = [];
    jobs.forEach(({ key, job }, index) => {
      const observation = recorded[index]?.observations[instrument];
      // A fly that died is left out, as a study leaves out its dead flies.
      if (key !== study || !observation || observation.died) return;
      flies.push({
        seed: job.seed,
        observation,
        scored: scoreObservation(observation, assay.scoring),
      });
    });
    try {
      return evaluateTarget(target, flies, { lightHours: assay.study.lightSchedule.lightHours });
    } catch (error) {
      if (!(error instanceof UnsupportedTargetError)) throw error;
      skipped.push({ id: target.id, title: target.title, reason: error.message });
      return [];
    }
  });

  const disagreement = assayDisagreements(runnable, jobs, recorded);

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

/**
 * Scoring Disagreement for each distinct Virtual Assay: each study, instrument and scoring rule,
 * however many targets use it.
 */
function assayDisagreements(
  runnable: readonly {
    target: ValidationTarget;
    assay: Assay;
    study: string;
    instrument: number;
  }[],
  jobs: readonly { key: string; job: ObserveJob }[],
  recorded: readonly FlyRecording[],
): AssayDisagreement[] {
  const assays = new Map<string, { first: (typeof runnable)[number]; targets: string[] }>();
  for (const each of runnable) {
    const key = JSON.stringify([each.study, each.instrument, each.assay.scoring]);
    const entry = assays.get(key) ?? { first: each, targets: [] };
    if (!entry.targets.includes(each.target.id)) entry.targets.push(each.target.id);
    assays.set(key, entry);
  }
  return [...assays.values()].map(({ first, targets }) => {
    const perFly = jobs.flatMap(({ key, job }, index) => {
      const recording = recorded[index];
      const observation = recording?.observations[first.instrument];
      if (key !== first.study || !recording || !observation || observation.died) return [];
      const scored = scoreObservation(observation, first.assay.scoring);
      return [
        { seed: job.seed, ...disagreementOf(scored, recording.vigilance, first.assay.scoring) },
      ];
    });
    return {
      id: targets.join("+"),
      title: assayTitle(first.target, first.assay),
      assay: first.target.assay.kind,
      targets,
      sleepThresholdMinutes: first.assay.scoring.sleepThresholdMinutes,
      perFly,
      pooled: perFly.length === 0 ? null : poolDisagreement(perFly),
    };
  });
}
