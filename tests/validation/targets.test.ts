import { describe, expect, it } from "vitest";
import { exponentialTailRate } from "../../src/validation/measures";
import { evaluateTarget, type AssayedFly } from "../../src/validation/targets";
import { scoreActivity, type ValidationTarget } from "../../src/validation";

const LD_12_12 = { lightHours: 12 };

/** A fly scored from one-second windows, from hand-built runs of activity. */
function fly(seed: number, runs: readonly (readonly [boolean, number])[]): AssayedFly {
  const active = runs.flatMap(([moved, seconds]) => Array<boolean>(seconds).fill(moved));
  return {
    seed,
    observation: { kind: "video-tracking", windowSeconds: 1, startSeconds: 0, runs, died: false },
    scored: scoreActivity(active, 1, 0, { sleepThresholdMinutes: 5 }),
  };
}

/** A target as the Evidence Pack holds it, with only what judging it reads filled in. */
function target(changes: Partial<ValidationTarget>): ValidationTarget {
  return {
    id: "t",
    title: "Bouts",
    heldOut: false,
    source: { citation: "A study", doi: null, url: "https://example.org" },
    assay: { kind: "video-tracking" },
    measure: "inactivity-bout-duration-distribution",
    published: [],
    ...changes,
  } as ValidationTarget;
}

const published = (label: string, value: number) => ({
  label,
  value,
  unit: "",
  uncertainty: { kind: "none" as const, value: null },
  n: null,
  location: "Text",
});

describe("judging a Validation Target", () => {
  // Inactivity Bouts of 10, 20, 40 and 80 s in the light, with 1-s activity between.
  const light = fly(1, [
    [true, 1],
    [false, 10],
    [true, 1],
    [false, 20],
    [true, 1],
    [false, 40],
    [true, 1],
    [false, 80],
    [true, 1],
  ]);

  it("gives one result per phase when its criterion lists phases, with that phase's value", () => {
    const results = evaluateTarget(
      target({
        published: [published("light phase beta", 0.7), published("dark phase beta", 0.8)],
        criterion: {
          kind: "exponent-within",
          description: "In each phase",
          exponentForm: "ccdf",
          aggregate: "mean-of-per-fly-fits",
          phases: [
            { phase: "light", xminSeconds: 1, xmaxSeconds: 100, low: 0, high: 5 },
            { phase: "dark", xminSeconds: 1, xmaxSeconds: 100, low: 0, high: 5 },
          ],
        },
      }),
      [light],
      LD_12_12,
    );
    expect(results.map((each) => each.id)).toEqual(["t:light", "t:dark"]);
    expect(results.map((each) => each.published.map((value) => value.value))).toEqual([
      [0.7],
      [0.8],
    ]);
    expect(results[0]?.display).toEqual({ kind: "scalar", accepted: { low: 0, high: 5 } });
    // Too few bouts to fit, so no value and no pass. The dark phase has none at all.
    expect(results.map((each) => each.result.pass)).toEqual([false, false]);
  });

  it("gives the CCDF's exponent, one less than the density's", () => {
    const flies = [1, 2, 3].map((seed) =>
      fly(
        seed,
        Array.from({ length: 30 }, (_, i) => [
          [true, 1] as const,
          [false, Math.round(10 * 1.2 ** i)] as const,
        ]).flat(),
      ),
    );
    const judged = (exponentForm: string) =>
      evaluateTarget(
        target({
          criterion: {
            kind: "exponent-within",
            description: "",
            exponentForm,
            aggregate: "pooled bouts",
            xminSeconds: 10,
            xmaxSeconds: 3000,
            low: 0,
            high: 5,
          },
        }),
        flies,
        LD_12_12,
      )[0]?.model.pooled as number;
    expect(judged("pdf") - judged("ccdf")).toBeCloseTo(1, 9);
  });

  it("averages each fly's statistic, or fits the pooled bouts, as the criterion says", () => {
    const short = fly(1, [
      [true, 1],
      ...Array.from(
        { length: 12 },
        () =>
          [
            [false, 3],
            [true, 1],
          ] as const,
      ).flat(),
    ]);
    const long = fly(2, [
      [true, 1],
      ...Array.from(
        { length: 12 },
        (_, i) =>
          [
            [false, 6 + 4 * i],
            [true, 1],
          ] as const,
      ).flat(),
    ]);
    const cv = (aggregate: string) =>
      evaluateTarget(
        target({
          criterion: {
            kind: "coefficient-of-variation-within",
            description: "",
            aggregate,
            low: 0,
            high: 9,
          },
        }),
        [short, long],
        LD_12_12,
      )[0]?.model;
    const perFly = cv("mean of per-fly values");
    expect(perFly?.perFly.map((each) => each.value)).toEqual([0, expect.any(Number)]);
    expect(perFly?.pooled).toBeCloseTo(((perFly?.perFly[1]?.value as number) + 0) / 2, 9);
    // Pooling a fly of short bouts with one of long ones spreads the lengths further.
    expect(cv("pooled bouts")?.pooled).toBeGreaterThan(perFly?.pooled as number);
  });
});

describe("an exponential tail's rate", () => {
  it("recovers the rate of exponential lengths", () => {
    const quantiles = Array.from({ length: 20_000 }, (_, i) => (i + 0.5) / 20_000);
    const lengths = quantiles.map((q) => -Math.log(1 - q) / 0.14);
    expect(exponentialTailRate(lengths, 13, 43)).toBeCloseTo(0.14, 2);
    expect(exponentialTailRate([], 13, 43)).toBeNull();
  });
});
