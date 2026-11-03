import { describe, expect, it } from "vitest";
import { createRandomStream } from "../../src/engine/random";
import {
  baselineCurve,
  baselineSurvival,
  curveDistance,
  empiricalSurvival,
  fitBaselineToCurve,
  fitBaselineToDurations,
} from "../../src/validation";

/** A seeded generator, so the samples are the same every run. */
function random(seed: number): () => number {
  const stream = createRandomStream(seed, 0);
  return () => stream.uniform();
}

/**
 * Durations from a power law with an exponential tail: the shorter of a power-law duration and an
 * exponential one, as the share lasting at least t is then the product of the two.
 */
function sample(n: number, beta: number, tau: number, xmin: number, seed: number): number[] {
  const next = random(seed);
  return Array.from({ length: n }, () =>
    Math.min(xmin * (1 - next()) ** (-1 / beta), xmin - tau * Math.log(1 - next())),
  );
}

/** Each duration as the start of the bin it fell in, as an assay scores it. */
function inBins(durations: readonly number[], bin: number): number[] {
  return durations.map((each) => Math.floor(each / bin) * bin);
}

describe("the descriptive baseline's fit", () => {
  // Stated tolerances: β within 0.05, τ within 15%, from 5000 bouts.
  it("recovers a power law with an exponential tail from samples of it", () => {
    for (const seed of [1, 2, 3]) {
      const fitted = fitBaselineToDurations(sample(5000, 0.7, 200, 3, seed), {
        xminSeconds: 3,
        binSeconds: 0,
      });
      expect(fitted?.beta).toBeGreaterThan(0.65);
      expect(fitted?.beta).toBeLessThan(0.75);
      expect(fitted?.tauSeconds).toBeGreaterThan(170);
      expect(fitted?.tauSeconds).toBeLessThan(230);
    }
  });

  it("recovers it from durations scored in bins", () => {
    const fitted = fitBaselineToDurations(inBins(sample(5000, 0.7, 200, 3, 4), 1), {
      xminSeconds: 3,
      binSeconds: 1,
    });
    expect(fitted?.beta).toBeGreaterThan(0.65);
    expect(fitted?.beta).toBeLessThan(0.75);
    expect(fitted?.tauSeconds).toBeGreaterThan(170);
    expect(fitted?.tauSeconds).toBeLessThan(230);
  });

  it("finds no tail in a pure power law", () => {
    const fitted = fitBaselineToDurations(sample(5000, 0.6, Infinity, 2, 5), {
      xminSeconds: 2,
      binSeconds: 0,
    });
    expect(fitted?.beta).toBeGreaterThan(0.55);
    expect(fitted?.beta).toBeLessThan(0.65);
    // Any tail is far longer than the bouts.
    expect(fitted?.tauSeconds ?? Infinity).toBeGreaterThan(1e5);
  });

  it("gives none for too few bouts", () => {
    expect(fitBaselineToDurations([3, 4, 5], { xminSeconds: 3, binSeconds: 0 })).toBeNull();
  });

  it("recovers a published fit's power law, exponential or both from its curve", () => {
    const power = fitBaselineToCurve(baselineCurve({ beta: 0.73, tauSeconds: null }, 3, 200), 3);
    expect(power.beta).toBeCloseTo(0.73, 6);
    expect(power.tauSeconds).toBeNull();

    const exponential = fitBaselineToCurve(
      baselineCurve({ beta: 0, tauSeconds: 1 / 0.14 }, 13, 43),
      13,
    );
    expect(exponential.beta).toBeCloseTo(0, 6);
    expect(exponential.tauSeconds).toBeCloseTo(1 / 0.14, 4);

    const both = fitBaselineToCurve(baselineCurve({ beta: 0.5, tauSeconds: 300 }, 3, 1000), 3);
    expect(both.beta).toBeCloseTo(0.5, 6);
    expect(both.tauSeconds).toBeCloseTo(300, 3);
  });
});

describe("distance from the baseline", () => {
  it("is the largest gap between two survival curves over a range", () => {
    const baseline = baselineSurvival({ beta: 1, tauSeconds: null }, 1);
    // At 2 s the baseline gives 0.5, and half of these durations are at least 2 s.
    expect(empiricalSurvival([1, 1, 2, 4], 1)(2)).toBe(0.5);
    expect(curveDistance(baseline, baseline, 1, 100)).toBe(0);
    expect(curveDistance(baseline, () => 1, 1, 100)).toBeCloseTo(0.99, 10);
  });
});
