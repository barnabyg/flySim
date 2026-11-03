import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname } from "node:path";
import { REPORT_PATH, readEvidencePack, runValidation } from "../src/validation";

export const EVIDENCE_PACK_PATH = "evidence/evidencePack.json";

/**
 * Runs every Virtual Assay once, before any test, and writes the validation report the tests and
 * the validation view read.
 */
export default async function runSuite(): Promise<void> {
  const pack = readEvidencePack(JSON.parse(readFileSync(EVIDENCE_PACK_PATH, "utf8")));
  const started = performance.now();
  const report = await runValidation({
    pack,
    jobs: availableParallelism(),
    onFlyFinished: (finished, total) => {
      if (finished % 8 === 0 || finished === total) {
        console.log(`Validation: ${finished} of ${total} flies run`);
      }
    },
  });
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`Validation report written to ${REPORT_PATH} in ${seconds} s`);
}
