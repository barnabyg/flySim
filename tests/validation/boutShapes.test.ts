import { describe, expect, it } from "vitest";
import { createRandomStream } from "../../src/engine/random";
import {
  distributionDistance,
  fallingOnlyWhenPooled,
  survivalCurve,
  testBoutShape,
} from "../../src/validation";

/** A seeded generator, so the samples are the same every run. */
function random(seed: number): () => number {
  const stream = createRandomStream(seed, 0);
  return () => stream.uniform();
}

function exponential(n: number, meanSeconds: number, seed: number): number[] {
  const next = random(seed);
  return Array.from({ length: n }, () => -meanSeconds * Math.log(1 - next()));
}

/** A power law with density exponent alpha above xmin, as Inactivity Bouts are. */
function powerLaw(n: number, alpha: number, xmin: number, seed: number): number[] {
  const next = random(seed);
  return Array.from({ length: n }, () => xmin * (1 - next()) ** (-1 / (alpha - 1)));
}

/** Durations as an assay scores them: the whole bins they fill, at least one. */
function inBins(durations: readonly number[], bin: number): number[] {
  return durations.map((each) => Math.max(1, Math.ceil(each / bin)) * bin);
}

describe("the bout shape test", () => {
  it("finds exponential durations consistent with exponential, whether exact or in bins", () => {
    for (const seed of [1, 2, 3]) {
      const exact = testBoutShape(exponential(2000, 8, seed), { xminSeconds: 0, binSeconds: 0 });
      expect(exact.verdict).toBe("exponential");
      expect(exact.shape).toBeCloseTo(1, 1);
      expect(exact.exponentialMeanSeconds).toBeCloseTo(8, 0);

      // 1-s bins for bouts lasting 8 s on average are coarse, which the test allows for.
      const binned = testBoutShape(inBins(exponential(5000, 8, seed), 1), {
        xminSeconds: 2,
        binSeconds: 1,
      });
      expect(binned.verdict).toBe("exponential");
      expect(binned.pValue).toBeGreaterThan(0.01);
    }
  });

  it("finds power-law durations have a falling hazard, whether exact or in bins", () => {
    for (const seed of [4, 5, 6]) {
      const exact = testBoutShape(powerLaw(500, 1.7, 3, seed), { xminSeconds: 3, binSeconds: 0 });
      expect(exact.verdict).toBe("falling");
      expect(exact.shape).toBeLessThan(0.8);
      expect(exact.pValue).toBeLessThan(1e-6);

      const binned = testBoutShape(inBins(powerLaw(500, 1.7, 3, seed), 0.04), {
        xminSeconds: 3,
        binSeconds: 0.04,
      });
      expect(binned.verdict).toBe("falling");
    }
  });

  it("finds a rising hazard in bouts more regular than exponential", () => {
    const next = random(7);
    // The sum of four exponentials, whose hazard rises.
    const regular = Array.from({ length: 1000 }, () =>
      [0, 1, 2, 3].reduce((sum) => sum - 2 * Math.log(1 - next()), 0),
    );
    expect(testBoutShape(regular, { xminSeconds: 0, binSeconds: 0 }).verdict).toBe("rising");
  });

  it("gives no verdict on too few bouts", () => {
    const few = testBoutShape(exponential(10, 8, 8), { xminSeconds: 0, binSeconds: 0 });
    expect(few).toMatchObject({ n: 10, verdict: "too-few", shape: null });
  });

  it("flags a falling hazard that only pooling flies with different rates makes", () => {
    const options = { xminSeconds: 0, binSeconds: 0 };
    const flies = [2, 5, 15, 40].map((mean, seed) => exponential(400, mean, seed + 10));
    const perFly = flies.map((fly) => testBoutShape(fly, options));
    const pooled = testBoutShape(flies.flat(), options);

    expect(perFly.map((fly) => fly.verdict)).toEqual(Array(4).fill("exponential"));
    expect(pooled.verdict).toBe("falling");
    expect(fallingOnlyWhenPooled(pooled, perFly)).toBe(true);

    // Flies that each show it are not an artefact of pooling.
    const heavy = [11, 12, 13, 14].map((seed) => powerLaw(400, 1.7, 1, seed));
    expect(
      fallingOnlyWhenPooled(
        testBoutShape(heavy.flat(), options),
        heavy.map((fly) => testBoutShape(fly, options)),
      ),
    ).toBe(false);
  });
});

describe("survival curves and distances", () => {
  it("gives the share of bouts lasting at least each duration, from xmin", () => {
    const curve = survivalCurve([1, 2, 4, 8, 16], 2, 4);
    // Evenly spaced on a log scale from xmin to the longest bout.
    expect(curve.durations.map((each) => Math.round(each * 1e6) / 1e6)).toEqual([2, 4, 8, 16]);
    expect(curve.survival).toEqual([1, 0.75, 0.5, 0.25]);
  });

  it("measures how far apart two sets of durations are, as the largest gap between them", () => {
    expect(distributionDistance([1, 2, 3, 4], [1, 2, 3, 4], 0)).toBe(0);
    expect(distributionDistance([1, 2], [3, 4], 0)).toBe(1);
    expect(distributionDistance([1, 2, 3, 4], [1, 2, 5, 6], 0)).toBe(0.5);
    expect(distributionDistance([1], [], 0)).toBeNull();
  });
});
