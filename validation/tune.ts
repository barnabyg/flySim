/**
 * The tuning harness. It runs the Virtual Assays of every counted target that isn't held out,
 * with candidate parameters, and prints one line per comparison: its id, whether it passes, and
 * its statistic. It never runs a held-out target, as `tuningPack` removes them before any fly
 * runs, so tuning can't read them. From the repo root:
 *
 *     npm run tune -- <overrides.json> [--seeds N] [--steps-per-second S] [--jobs J]
 *
 * which runs `node --import ./src/batch/resolveTypeScript.ts validation/tune.ts`.
 * The overrides file is a JSON object of parameter values that replace DEFAULT_PARAMETERS', such
 * as `{"stopWalkingSpontaneousRate": 0.05}`, or `{}` for the defaults. Seeds run from 1 to N, 16
 * by default as in the suite. At most 12 flies run at once unless `--jobs` says otherwise.
 */
import { readFileSync } from "node:fs";
import { DEFAULT_PARAMETERS, DEFAULT_STEPS_PER_SECOND, type ModelParameters } from "../src/engine";
import { VALIDATION_SEEDS, readEvidencePack, runValidation, tuningPack } from "../src/validation";
import { EVIDENCE_PACK_PATH } from "./globalSetup";

const USAGE =
  "Usage: validation/tune.ts <overrides.json> [--seeds N] [--steps-per-second S] [--jobs J]";

function option(args: readonly string[], name: string): number | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} needs a whole number`);
  return value;
}

function readOverrides(path: string): ModelParameters {
  const overrides: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    throw new Error("The overrides file must hold a JSON object");
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (!(name in DEFAULT_PARAMETERS)) throw new Error(`There is no parameter ${name}`);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${name} must be a number`);
    }
  }
  return { ...DEFAULT_PARAMETERS, ...(overrides as Partial<ModelParameters>) };
}

const args = process.argv.slice(2);
const [overridesPath] = args;
if (!overridesPath || overridesPath.startsWith("--")) throw new Error(USAGE);
const seedCount = option(args, "--seeds");
const report = await runValidation({
  pack: tuningPack(readEvidencePack(JSON.parse(readFileSync(EVIDENCE_PACK_PATH, "utf8")))),
  seeds:
    seedCount === undefined
      ? VALIDATION_SEEDS
      : Array.from({ length: seedCount }, (_, index) => index + 1),
  stepsPerSecond: option(args, "--steps-per-second") ?? DEFAULT_STEPS_PER_SECOND,
  parameters: readOverrides(overridesPath),
  jobs: option(args, "--jobs") ?? 12,
});
for (const skipped of report.skipped) console.log(`${skipped.id} skipped: ${skipped.reason}`);
for (const { id, result } of report.targets) {
  const statistic = result.statistic === null ? "none" : result.statistic.toFixed(3);
  console.log(`${id} ${result.pass ? "pass" : "FAIL"} ${statistic}  ${result.description}`);
}
