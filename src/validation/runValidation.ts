import {
  DEFAULT_LIGHT_SCHEDULE,
  DEFAULT_PARAMETERS,
  DEFAULT_STEPS_PER_SECOND,
  MODEL_VERSION,
} from "../engine";
import { runInProcesses } from "../batch/processPool";
import type { BeamCrossingAssay } from "./assays";
import type { BeamObservation } from "./beamMonitor";
import { scoreBeamObservation } from "./beamMonitor";
import { countedTargets, type EvidencePack, type ValidationTarget } from "./evidencePack";
import type { ObserveJob } from "./observeProcess";
import { REPORT_FORMAT, REPORT_VERSION, type ValidationReport } from "./report";
import { UnsupportedTargetError, evaluateTarget, type AssayedFly } from "./targets";

const OBSERVE_PROCESS = new URL("./observeProcess.ts", import.meta.url);

/** The seeds every assay runs, so the same command always gives the same report. */
export const VALIDATION_SEEDS: readonly number[] = Array.from({ length: 16 }, (_, i) => i + 1);

export interface ValidationOptions {
  readonly pack: EvidencePack;
  readonly seeds?: readonly number[];
  readonly stepsPerSecond?: number;
  /** How many flies run at once, each in its own process. */
  readonly jobs: number;
  /** When the report is made, which is all that differs between two reports of the same run. */
  readonly now?: Date;
  readonly onFlyFinished?: (finished: number, total: number) => void;
}

/**
 * A target's Virtual Assay, set up as its study set up its own, or an error saying why the suite
 * can't run it yet.
 */
export function assayFor(target: ValidationTarget): BeamCrossingAssay {
  const { assay, fly } = target;
  if (assay.kind !== "beam-crossing") {
    throw new UnsupportedTargetError(`There is no ${assay.kind} Virtual Assay yet`);
  }
  const lengthMetres = assay.chamber.lengthMm / 1000;
  return {
    kind: "beam-crossing",
    chamber: {
      name: assay.chamber.description,
      lengthMetres,
      widthMetres: assay.chamber.widthMm / 1000,
      heightMetres: assay.chamber.heightMm / 1000,
    },
    beamPositionsMetres: assay.beamPositionsMm?.map((mm) => mm / 1000) ?? [lengthMetres / 2],
    binSeconds: assay.binSeconds,
    sleepThresholdMinutes: assay.sleepThresholdMinutes,
    acclimationHours: assay.acclimationHours,
    recordedDays: assay.recordedDays,
    lightSchedule: { ...DEFAULT_LIGHT_SCHEDULE, lightHours: fly.lightSchedule.lightHours },
  };
}

/**
 * Runs every counted target's Virtual Assay for each seed, each fly in its own process, scores
 * what the assays observed, and judges the model against each target. Targets sharing an assay's
 * settings share its flies.
 */
export async function runValidation(options: ValidationOptions): Promise<ValidationReport> {
  const seeds = options.seeds ?? VALIDATION_SEEDS;
  const stepsPerSecond = options.stepsPerSecond ?? DEFAULT_STEPS_PER_SECOND;
  const skipped: { id: string; title: string; reason: string }[] = [];
  const runnable: { target: ValidationTarget; assay: BeamCrossingAssay; key: string }[] = [];
  for (const target of countedTargets(options.pack)) {
    try {
      const assay = assayFor(target);
      runnable.push({ target, assay, key: JSON.stringify(assay) });
    } catch (error) {
      if (!(error instanceof UnsupportedTargetError)) throw error;
      skipped.push({ id: target.id, title: target.title, reason: error.message });
    }
  }

  const assays = new Map(runnable.map(({ key, assay }) => [key, assay]));
  const jobs: (ObserveJob & { key: string })[] = [...assays].flatMap(([key, assay]) =>
    seeds.map((seed) => ({ key, assay, seed, stepsPerSecond })),
  );
  const observations = await runInProcesses<BeamObservation>(
    OBSERVE_PROCESS,
    jobs,
    options.jobs,
    (_, finished) => options.onFlyFinished?.(finished, jobs.length),
  );
  const fliesByAssay = new Map<string, AssayedFly[]>();
  jobs.forEach(({ key, assay, seed }, index) => {
    const observation = observations[index];
    // A fly that died is left out, as a study leaves out its dead flies.
    if (!observation || observation.died) return;
    const flies = fliesByAssay.get(key) ?? [];
    flies.push({
      seed,
      observation,
      scored: scoreBeamObservation(observation, assay.sleepThresholdMinutes),
    });
    fliesByAssay.set(key, flies);
  });

  const targets = runnable.flatMap(({ target, assay, key }) => {
    try {
      return [
        evaluateTarget(target, fliesByAssay.get(key) ?? [], {
          lightHours: assay.lightSchedule.lightHours,
        }),
      ];
    } catch (error) {
      if (!(error instanceof UnsupportedTargetError)) throw error;
      skipped.push({ id: target.id, title: target.title, reason: error.message });
      return [];
    }
  });

  return {
    format: REPORT_FORMAT,
    version: REPORT_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    modelVersion: MODEL_VERSION,
    parameters: DEFAULT_PARAMETERS,
    stepsPerSecond,
    seeds,
    targets,
    skipped,
  };
}
