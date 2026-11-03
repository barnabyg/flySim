import { describe, expect, it } from "vitest";
import {
  coefficientOfVariation,
  completeDurations,
  meanSleepBoutMinutes,
  powerLawExponent,
  scoredSleepMinutesPerDay,
  scoredSleepProfile,
  sleepBoutsPerDay,
} from "../../src/validation/measures";
import { scoreActivity } from "../../src/validation";

const MINUTE = 60;
const DAY_MINUTES = 24 * 60;
const LD_12_12 = { lightHours: 12 };

/** A day of one-minute bins, inactive in the given minutes of the day and active otherwise. */
function dayInactiveDuring(...spans: (readonly [number, number])[]): boolean[] {
  return Array.from(
    { length: DAY_MINUTES },
    (_, minute) => !spans.some(([from, to]) => minute >= from && minute < to),
  );
}

describe("measures of Scored Sleep", () => {
  // From lights-on: 10 min of sleep in the light, a 3-min pause, then 2 h of sleep in the dark.
  const fly = scoreActivity(
    dayInactiveDuring([60, 70], [200, 203], [13 * 60, 15 * 60]),
    MINUTE,
    0,
    5,
  );

  it("adds up Scored Sleep per day, and per light and dark phase", () => {
    expect(scoredSleepMinutesPerDay(fly, "day", LD_12_12)).toBe(130);
    expect(scoredSleepMinutesPerDay(fly, "light", LD_12_12)).toBe(10);
    expect(scoredSleepMinutesPerDay(fly, "dark", LD_12_12)).toBe(120);
  });

  it("averages over the recorded days, and lines a record up with the time of day", () => {
    // The same day twice, recorded from the second day of a run.
    const twoDays = scoreActivity(
      [
        ...dayInactiveDuring([60, 70], [13 * 60, 15 * 60]),
        ...dayInactiveDuring([60, 70], [13 * 60, 15 * 60]),
      ],
      MINUTE,
      86_400,
      5,
    );
    expect(scoredSleepMinutesPerDay(twoDays, "light", LD_12_12)).toBe(10);
    expect(scoredSleepMinutesPerDay(twoDays, "dark", LD_12_12)).toBe(120);
    expect(sleepBoutsPerDay(twoDays, "day", LD_12_12)).toBe(2);
  });

  it("gives the minutes of Scored Sleep in each hour from lights-on", () => {
    const profile = scoredSleepProfile(fly, 60);
    expect(profile).toHaveLength(24);
    expect(profile[1]).toBe(10);
    expect(profile[3]).toBe(0);
    expect(profile[13]).toBe(60);
    expect(profile[14]).toBe(60);
    expect(profile.reduce((sum, each) => sum + each, 0)).toBe(130);
  });

  it("counts and measures sleep bouts by the phase they start in", () => {
    expect(sleepBoutsPerDay(fly, "light", LD_12_12)).toBe(1);
    expect(sleepBoutsPerDay(fly, "dark", LD_12_12)).toBe(1);
    expect(meanSleepBoutMinutes(fly, "dark", LD_12_12)).toBe(120);
    expect(meanSleepBoutMinutes(fly, "day", LD_12_12)).toBe(65);
    const awake = scoreActivity(Array<boolean>(60).fill(true), MINUTE, 0, 5);
    expect(meanSleepBoutMinutes(awake, "day", LD_12_12)).toBeNull();
  });
});

describe("measures of bout shape", () => {
  it("leaves bouts cut off by the record's ends out of their lengths", () => {
    const fly = scoreActivity([false, true, false, false, true, true, false], MINUTE, 0, 5);
    expect(completeDurations(fly.inactivityBouts)).toEqual([120]);
    expect(completeDurations(fly.activityBouts)).toEqual([60, 120]);
  });

  it("gives a coefficient of variation near 1 for exponential lengths and more for a heavy tail", () => {
    // Evenly spread quantiles stand in for samples, so the test is exact rather than random.
    const quantiles = Array.from({ length: 2000 }, (_, i) => (i + 0.5) / 2000);
    const exponential = quantiles.map((q) => -Math.log(1 - q));
    expect(coefficientOfVariation(exponential)).toBeCloseTo(1, 1);
    const lognormalish = exponential.map((each) => each ** 3);
    expect(coefficientOfVariation(lognormalish)).toBeGreaterThan(2);
    expect(coefficientOfVariation([5])).toBeNull();
  });

  it("recovers a power law's exponent between its bounds", () => {
    // Quantiles of p(x) ∝ x^-1.8 between 60 s and 6000 s.
    const [alpha, xmin, xmax] = [1.8, 60, 6000];
    const values = Array.from({ length: 4000 }, (_, i) => {
      const q = (i + 0.5) / 4000;
      const [a, b] = [xmin ** (1 - alpha), xmax ** (1 - alpha)];
      return (a - q * (a - b)) ** (1 / (1 - alpha));
    });
    expect(powerLawExponent(values, xmin, xmax)).toBeCloseTo(alpha, 2);
    expect(powerLawExponent(values.slice(0, 5), xmin, xmax)).toBeNull();
  });
});
