import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REPORT_PATH, readValidationReport } from "../src/validation";

// The global setup has written the report before this file is collected.
const report = readValidationReport(readFileSync(REPORT_PATH, "utf8"));

const EXPECTED = {
  falling: "have a falling hazard",
  exponential: "are consistent with exponential",
} as const;

describe("bout shapes, ADR-0001's first validation stage", () => {
  it("covers each assay that scores bouts, at the suite's step size and another", () => {
    expect(report.boutShapes.length).toBeGreaterThan(0);
    for (const assay of report.boutShapes) {
      expect(assay.stepSizes.map((each) => each.stepsPerSecond)).toContain(report.stepsPerSecond);
      expect(assay.stepSizes.length, assay.title).toBeGreaterThanOrEqual(2);
    }
  });

  for (const assay of report.boutShapes) {
    describe(assay.title, () => {
      for (const { stepsPerSecond, kinds } of assay.stepSizes) {
        for (const kind of kinds) {
          it(`${kind.bouts} bouts ${EXPECTED[kind.expected]} per fly and pooled at ${stepsPerSecond} steps/s`, () => {
            expect(kind.pass, kind.description).toBe(true);
          });

          // A check that reports, rather than a criterion: the report says whether it was found.
          it(`${kind.bouts} bouts at ${stepsPerSecond} steps/s: a falling hazard only when pooled was ${kind.fallingOnlyWhenPooled ? "found" : "not found"}`, () => {
            expect(typeof kind.fallingOnlyWhenPooled).toBe("boolean");
          });
        }
      }

      for (const each of assay.agreement) {
        const [first, second] = each.stepsPerSecond;
        it(`${each.bouts} bouts agree at ${first} and ${second} steps/s, to a distance of ${each.tolerance}`, () => {
          expect(each.pass, `distance ${String(each.distance)}`).toBe(true);
        });
      }
    });
  }
});
