import type { DriverRelationship, ModelParameters, RelationshipLabel } from "../engine";
import type { BoutKind, BoutKindShape } from "./boutShapes";
import type { Disagreement } from "./disagreement";

/** What every validation report says it is. */
export const REPORT_FORMAT = "fly-sim-validation-report";
export const REPORT_VERSION = 2;

/**
 * Where the validation suite writes its latest report, from the repo root. The viewer's dev server
 * serves it from the same path.
 */
export const REPORT_PATH = "validation-output/report.json";

/** A published value, as the Evidence Pack records it. */
export interface PublishedValue {
  readonly label: string;
  /** One value, or one per bin of a profile. */
  readonly value: number | readonly number[];
  readonly unit: string;
  readonly uncertainty: {
    readonly kind: "sem" | "sd" | "ci95" | "iqr" | "range" | "none";
    /**
     * One number is a half-width either side of the value. For a single value, two numbers are
     * the low and high ends, as of a confidence interval or range. For a profile, there is one
     * half-width per bin.
     */
    readonly value: number | readonly number[] | null;
  };
  /** How many flies, or null if the source doesn't say. */
  readonly n: number | null;
  /** The figure, table or passage the value comes from. */
  readonly location: string;
}

/** One simulated fly's value for a target's measure. */
export interface FlyValue {
  readonly seed: number;
  /** One value, or one per bin of a profile, or null if the fly gave none, as with no bouts. */
  readonly value: number | readonly number[] | null;
}

/** How a target's comparison is drawn. */
export type TargetDisplay =
  /** One number per fly, compared with an accepted interval. */
  | { readonly kind: "scalar"; readonly accepted: { readonly low: number; readonly high: number } }
  /** A value per bin, such as minutes of Scored Sleep per hour across the day. */
  | { readonly kind: "profile"; readonly binLabels: readonly string[] };

/** The model against one Validation Target. */
export interface TargetResult {
  readonly id: string;
  readonly title: string;
  readonly heldOut: boolean;
  readonly citation: string;
  /** The Virtual Assay it was measured with, such as "beam-crossing". */
  readonly assay: string;
  readonly measure: string;
  readonly unit: string;
  readonly published: readonly PublishedValue[];
  readonly model: {
    readonly perFly: readonly FlyValue[];
    /** Across every fly, as the study pooled its flies. */
    readonly pooled: number | readonly number[] | null;
  };
  readonly criterion: { readonly kind: string; readonly description: string };
  readonly display: TargetDisplay;
  /** Whether the model meets the target's criterion, and the number that decided it. */
  readonly result: {
    readonly pass: boolean;
    readonly statistic: number | null;
    readonly description: string;
  };
}

/**
 * How often one Virtual Assay's Scored Sleep disagrees with the fly's true Vigilance State. It
 * measures the 5-minute rule, not the model, so it never decides whether the model passes.
 */
export interface AssayDisagreement {
  readonly id: string;
  /** The study and instrument, such as "Zimmerman 2008: beam monitor, 30 s bins". */
  readonly title: string;
  readonly assay: string;
  /** The ids of the targets measured with this assay. */
  readonly targets: readonly string[];
  readonly sleepThresholdMinutes: number;
  readonly perFly: readonly ({ readonly seed: number } & Disagreement)[];
  /** Every fly together, or null if none lived through the record. */
  readonly pooled: Disagreement | null;
}

/**
 * The shapes of one Virtual Assay's bouts across step sizes: ADR-0001's first validation stage,
 * which needs non-exponential Inactivity Bouts and near-exponential Activity Bouts.
 */
export interface AssayBoutShapes {
  readonly id: string;
  readonly title: string;
  /** The ids of the targets measured with this assay. */
  readonly targets: readonly string[];
  /** The width of the bins the assay scores bouts in. */
  readonly binSeconds: number;
  /** The suite's own step size first. */
  readonly stepSizes: readonly {
    readonly stepsPerSecond: number;
    readonly kinds: readonly BoutKindShape[];
  }[];
  /** How far each other step size's pooled bouts are from the first's. */
  readonly agreement: readonly {
    readonly bouts: BoutKind;
    readonly stepsPerSecond: readonly [number, number];
    /** The two-sample Kolmogorov–Smirnov distance, or null with no bouts to compare. */
    readonly distance: number | null;
    readonly tolerance: number;
    readonly pass: boolean;
  }[];
}

/** What the validation suite found, tagged so it can be traced back to the model that made it. */
export interface ValidationReport {
  readonly format: typeof REPORT_FORMAT;
  readonly version: number;
  /** When the report was made, as an ISO 8601 time. Everything else is the same each time. */
  readonly generatedAt: string;
  readonly modelVersion: string;
  readonly parameters: ModelParameters;
  readonly stepsPerSecond: number;
  readonly seeds: readonly number[];
  /** Each parameter's and Driver relationship's label, as the model that made the report had them. */
  readonly relationships: {
    readonly parameters: Readonly<Record<string, RelationshipLabel>>;
    readonly drivers: readonly DriverRelationship[];
  };
  readonly targets: readonly TargetResult[];
  /** Counted targets the suite has no Virtual Assay or measure for yet, and why. */
  readonly skipped: readonly {
    readonly id: string;
    readonly title: string;
    readonly reason: string;
  }[];
  /** Scoring Disagreement for each distinct Virtual Assay the targets use. */
  readonly disagreement: readonly AssayDisagreement[];
  /** Bout shapes for each Virtual Assay that scores bouts. */
  readonly boutShapes: readonly AssayBoutShapes[];
}

/** Why a report no longer describes the model, or null if it still does. */
export function staleness(
  report: Pick<ValidationReport, "modelVersion" | "parameters">,
  modelVersion: string,
  parameters: ModelParameters,
): string | null {
  if (report.modelVersion !== modelVersion) {
    return `It was made by model version ${report.modelVersion}, and the model is now version ${modelVersion}.`;
  }
  const changed = (Object.keys(parameters) as (keyof ModelParameters)[]).filter(
    (name) => report.parameters[name] !== parameters[name],
  );
  if (changed.length > 0) {
    return `The model's parameters have changed since: ${changed.join(", ")}.`;
  }
  return null;
}

/** Reads a report's JSON, or throws if it isn't one. */
export function readValidationReport(json: string): ValidationReport {
  const parsed = JSON.parse(json) as Partial<ValidationReport> | null;
  if (parsed?.format !== REPORT_FORMAT || parsed.version !== REPORT_VERSION) {
    throw new Error("This isn't a validation report this version of the simulator can read.");
  }
  if (
    typeof parsed.generatedAt !== "string" ||
    typeof parsed.modelVersion !== "string" ||
    typeof parsed.parameters !== "object" ||
    typeof parsed.stepsPerSecond !== "number" ||
    !Array.isArray(parsed.seeds) ||
    typeof parsed.relationships?.parameters !== "object" ||
    !Array.isArray(parsed.relationships.drivers) ||
    !Array.isArray(parsed.targets) ||
    !Array.isArray(parsed.skipped) ||
    !Array.isArray(parsed.disagreement) ||
    !Array.isArray(parsed.boutShapes)
  ) {
    throw new Error("This validation report is incomplete.");
  }
  return parsed as ValidationReport;
}
