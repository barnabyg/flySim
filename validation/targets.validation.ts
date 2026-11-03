import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REPORT_PATH, readValidationReport } from "../src/validation";
import { AWAITING_TUNING } from "./awaitingTuning";

// The global setup has written the report before this file is collected.
const report = readValidationReport(readFileSync(REPORT_PATH, "utf8"));

describe("the model against the Evidence Pack", () => {
  it("runs every counted Validation Target through its Virtual Assay", () => {
    expect(report.skipped).toEqual([]);
    expect(report.targets.length).toBeGreaterThan(0);
  });

  it("has at least one held-out target", () => {
    expect(report.targets.some((target) => target.heldOut)).toBe(true);
  });

  for (const target of report.targets) {
    if (target.heldOut) {
      // Reported, never tuned against, so it can't fail the suite.
      it(`reports held-out ${target.id}: ${target.result.pass ? "matches" : "doesn't match"}`, () => {
        expect(typeof target.result.pass).toBe("boolean");
        expect(target.model.perFly.length).toBeGreaterThan(0);
      });
    } else if (AWAITING_TUNING.has(target.id)) {
      it.fails(`${target.id} doesn't meet its criterion yet: ${target.result.description}`, () => {
        expect(target.result.pass).toBe(true);
      });
    } else {
      it(`${target.id} meets its criterion: ${target.criterion.description}`, () => {
        expect(target.result.pass, target.result.description).toBe(true);
      });
    }
  }
});
