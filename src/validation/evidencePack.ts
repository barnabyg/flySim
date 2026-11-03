import type { PublishedValue } from "./report";

/**
 * The Evidence Pack: the sourced Validation Targets the model is checked against. It lives in
 * `evidence/evidencePack.json`, with a readable summary beside it, and this is its schema.
 */
export interface EvidencePack {
  readonly format: "fly-sim-evidence-pack";
  readonly version: 1;
  readonly referenceFly: {
    readonly strain: string;
    readonly reason: string;
    readonly sex: "male";
    readonly ageDays: { readonly min: number; readonly max: number };
    readonly housing: string;
  };
  readonly targets: readonly ValidationTarget[];
  /** Sources that don't count, such as those that couldn't be read in full, and why. */
  readonly excluded: readonly {
    readonly citation: string;
    readonly url: string | null;
    readonly reason: string;
  }[];
}

export interface ValidationTarget {
  readonly id: string;
  readonly title: string;
  /** False for a candidate that doesn't count yet, as for a later phase. */
  readonly counted: boolean;
  readonly phase: number;
  /** Reported, but never tuned against, so validation isn't circular. */
  readonly heldOut: boolean;
  readonly verification: {
    readonly status: "read-in-full" | "not-read-in-full";
    /** The full text actually read. */
    readonly readFrom: string;
    readonly notes: string;
  };
  readonly source: { readonly citation: string; readonly doi: string | null; readonly url: string };
  readonly study: { readonly description: string };
  readonly assay: TargetAssay;
  readonly fly: {
    readonly sex: "male";
    readonly strain: string;
    readonly ageDays: string;
    readonly housing: string;
    readonly lightSchedule: { readonly lightHours: number; readonly description: string };
    readonly temperatureC: number | null;
    readonly food: string;
  };
  readonly measure: string;
  readonly measureDefinition: string;
  readonly published: readonly PublishedValue[];
  readonly criterion: TargetCriterion;
  /** Which of the spec's unverified claims this confirms or corrects, if any. */
  readonly claimChecked: string | null;
}

/** The study's Virtual Assay: how it measured, in what, and how it scored. */
export interface TargetAssay {
  readonly kind: string;
  readonly chamber: {
    readonly description: string;
    readonly lengthMm: number;
    readonly widthMm: number;
    readonly heightMm: number;
    readonly foodAndWater: string;
  };
  /** Where each beam crosses the tube, in mm from its food end, for a beam-crossing monitor. */
  readonly beamPositionsMm: readonly number[] | null;
  readonly samplingIntervalSeconds: number;
  readonly binSeconds: number;
  readonly movementRule: string;
  readonly movementThreshold: {
    readonly value: number;
    readonly unit: string;
    readonly description: string;
  } | null;
  /** Null when the source doesn't say. */
  readonly groomingCountsAsMovement: boolean | null;
  readonly sleepThresholdMinutes: number;
  readonly acclimationHours: number;
  readonly recordedDays: number;
}

/** How the model must compare with the published values to match. */
export interface TargetCriterion {
  readonly kind: string;
  readonly description: string;
  readonly [parameter: string]: unknown;
}

/** Thrown for a pack that doesn't follow the schema, saying what is wrong. */
export class EvidencePackError extends Error {
  override readonly name = "EvidencePackError";
}

type Check = (value: unknown) => boolean;

const isString: Check = (value) => typeof value === "string" && value.length > 0;
const isNumber: Check = (value) => typeof value === "number" && Number.isFinite(value);
const isBoolean: Check = (value) => typeof value === "boolean";
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const orNull =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const isNumberOrNumbers: Check = (value) =>
  isNumber(value) || (Array.isArray(value) && value.length > 0 && value.every(isNumber));

/** Every field a target must have, by its path, and what it must be. */
const TARGET_FIELDS: readonly (readonly [string, Check])[] = [
  ["id", isString],
  ["title", isString],
  ["counted", isBoolean],
  ["phase", isNumber],
  ["heldOut", isBoolean],
  ["verification.status", (value) => value === "read-in-full" || value === "not-read-in-full"],
  ["verification.readFrom", isString],
  ["verification.notes", (value) => typeof value === "string"],
  ["source.citation", isString],
  ["source.doi", orNull(isString)],
  ["source.url", isString],
  ["study.description", isString],
  ["assay.kind", isString],
  ["assay.chamber.description", isString],
  ["assay.chamber.lengthMm", isNumber],
  ["assay.chamber.widthMm", isNumber],
  ["assay.chamber.heightMm", isNumber],
  ["assay.chamber.foodAndWater", isString],
  ["assay.beamPositionsMm", orNull((value) => Array.isArray(value) && value.every(isNumber))],
  ["assay.samplingIntervalSeconds", isNumber],
  ["assay.binSeconds", isNumber],
  ["assay.movementRule", isString],
  ["assay.movementThreshold", orNull(isObject)],
  ["assay.groomingCountsAsMovement", orNull(isBoolean)],
  ["assay.sleepThresholdMinutes", isNumber],
  ["assay.acclimationHours", isNumber],
  ["assay.recordedDays", isNumber],
  ["fly.sex", (value) => value === "male"],
  ["fly.strain", isString],
  ["fly.ageDays", isString],
  ["fly.housing", isString],
  ["fly.lightSchedule.lightHours", isNumber],
  ["fly.lightSchedule.description", isString],
  ["fly.temperatureC", orNull(isNumber)],
  ["fly.food", isString],
  ["measure", isString],
  ["measureDefinition", isString],
  ["published", (value) => Array.isArray(value) && value.length > 0],
  ["criterion.kind", isString],
  ["criterion.description", isString],
  ["claimChecked", orNull(isString)],
];

const UNCERTAINTY_KINDS: readonly unknown[] = ["sem", "sd", "ci95", "iqr", "range", "none"];

const PUBLISHED_FIELDS: readonly (readonly [string, Check])[] = [
  ["label", isString],
  ["value", isNumberOrNumbers],
  ["unit", isString],
  ["uncertainty.kind", (value) => UNCERTAINTY_KINDS.includes(value)],
  ["uncertainty.value", orNull(isNumberOrNumbers)],
  ["n", orNull(isNumber)],
  ["location", isString],
];

function at(value: unknown, path: string): { found: boolean; value: unknown } {
  let current = value;
  for (const key of path.split(".")) {
    if (!isObject(current) || !(key in current)) return { found: false, value: undefined };
    current = current[key];
  }
  return { found: true, value: current };
}

function problemsWith(
  value: unknown,
  fields: readonly (readonly [string, Check])[],
  where: string,
): string[] {
  return fields.flatMap(([path, check]) => {
    const field = at(value, path);
    if (!field.found) return [`${where} has no ${path}`];
    return check(field.value) ? [] : [`${where}'s ${path} isn't valid`];
  });
}

function targetProblems(target: unknown, index: number): string[] {
  const id = at(target, "id").value;
  const where = `Target ${typeof id === "string" ? id : String(index + 1)}`;
  const problems = problemsWith(target, TARGET_FIELDS, where);
  const published = at(target, "published").value;
  if (Array.isArray(published)) {
    published.forEach((each, number) => {
      problems.push(
        ...problemsWith(each, PUBLISHED_FIELDS, `${where}'s published value ${number + 1}`),
      );
    });
  }
  const counted = at(target, "counted").value === true;
  if (counted && at(target, "verification.status").value !== "read-in-full") {
    problems.push(`${where} counts, but its source wasn't read in full`);
  }
  return problems;
}

/**
 * Checks a pack against the schema, and that at least one counted target is held out from tuning
 * and every counted one was read in full. Throws saying everything that is wrong.
 */
export function readEvidencePack(value: unknown): EvidencePack {
  if (!isObject(value) || value["format"] !== "fly-sim-evidence-pack" || value["version"] !== 1) {
    throw new EvidencePackError("This isn't a version 1 Evidence Pack.");
  }
  const problems = problemsWith(
    value,
    [
      ["referenceFly.strain", isString],
      ["referenceFly.reason", isString],
      ["referenceFly.sex", (each) => each === "male"],
      ["referenceFly.ageDays.min", isNumber],
      ["referenceFly.ageDays.max", isNumber],
      ["referenceFly.housing", isString],
      ["excluded", Array.isArray],
    ],
    "The pack",
  );
  const targets: readonly unknown[] = Array.isArray(value["targets"]) ? value["targets"] : [];
  if (targets.length === 0) problems.push("The pack has no targets");
  targets.forEach((target, index) => {
    problems.push(...targetProblems(target, index));
  });
  const ids = targets.map((target) => at(target, "id").value);
  if (new Set(ids).size !== ids.length) problems.push("Two targets have the same id");
  const heldOut = targets.filter(
    (target) => at(target, "counted").value === true && at(target, "heldOut").value === true,
  );
  if (heldOut.length === 0) problems.push("No counted target is held out from tuning");
  if (problems.length > 0) throw new EvidencePackError(`${problems.join(". ")}.`);
  return value as unknown as EvidencePack;
}

/** The targets that count. Candidates for later phases are left out. */
export function countedTargets(pack: EvidencePack): readonly ValidationTarget[] {
  return pack.targets.filter((target) => target.counted);
}
