import { describe, expect, expectTypeOf, it } from "vitest";
import {
  activeBins,
  poolBouts,
  scoreActivity,
  scoreBeamObservation,
  type BeamObservation,
} from "../../src/validation";

const MINUTE = 60;

/** A monitor's record of crossings, one count per minute, starting at the run's second 0. */
function observation(counts: readonly number[]): BeamObservation {
  return { kind: "beam-crossing", binSeconds: MINUTE, startSeconds: 0, counts, died: false };
}

describe("scoring an activity monitor's record", () => {
  it("counts a minute with any beam crossing as active, and one with none as inactive", () => {
    expect(activeBins(observation([0, 3, 0, 1, 12]))).toEqual([false, true, false, true, true]);
  });

  it("finds Inactivity Bouts and Activity Bouts, including those cut off by the record's ends", () => {
    // Inactive for 2 min, active 1, inactive 6, active 2, inactive 3 to the end.
    const counts = [0, 0, 4, 0, 0, 0, 0, 0, 0, 2, 7, 0, 0, 0];
    const scored = scoreBeamObservation(observation(counts), 5);

    expect(scored.inactivityBouts).toEqual([
      { startSeconds: 0, durationSeconds: 120, cutOffAtStart: true, cutOffAtEnd: false },
      { startSeconds: 180, durationSeconds: 360, cutOffAtStart: false, cutOffAtEnd: false },
      { startSeconds: 660, durationSeconds: 180, cutOffAtStart: false, cutOffAtEnd: true },
    ]);
    expect(scored.activityBouts).toEqual([
      { startSeconds: 120, durationSeconds: 60, cutOffAtStart: false, cutOffAtEnd: false },
      { startSeconds: 540, durationSeconds: 120, cutOffAtStart: false, cutOffAtEnd: false },
    ]);
    // Only an Inactivity Bout of 5 minutes or longer is Scored Sleep.
    expect(scored.scoredSleep).toEqual([
      { startSeconds: 180, durationSeconds: 360, cutOffAtStart: false, cutOffAtEnd: false },
    ]);
  });

  it("scores a bout of exactly the threshold as sleep, and one a bin shorter as not", () => {
    const five = scoreActivity([true, false, false, false, false, false, true], MINUTE, 0, 5);
    expect(five.scoredSleep.map((bout) => bout.durationSeconds)).toEqual([300]);
    const four = scoreActivity([true, false, false, false, false, true], MINUTE, 0, 5);
    expect(four.scoredSleep).toEqual([]);
  });

  it("scores a record cut off on both sides as one bout, and Scored Sleep if long enough", () => {
    const scored = scoreActivity(Array<boolean>(10).fill(false), MINUTE, 600, 5);
    expect(scored.inactivityBouts).toEqual([
      { startSeconds: 600, durationSeconds: 600, cutOffAtStart: true, cutOffAtEnd: true },
    ]);
    expect(scored.activityBouts).toEqual([]);
    expect(scored.scoredSleep).toHaveLength(1);
  });

  it("scores an empty record as no bouts", () => {
    expect(scoreActivity([], MINUTE, 0, 5)).toMatchObject({
      inactivityBouts: [],
      activityBouts: [],
      scoredSleep: [],
    });
  });

  it("pools bouts across flies, keeping each fly's own", () => {
    const flies = [
      scoreActivity([true, false, false, true], MINUTE, 0, 5),
      scoreActivity([false, true, true, false], MINUTE, 0, 5),
    ];
    const pooled = poolBouts(flies);
    expect(pooled.inactivityBouts.map((bout) => bout.durationSeconds)).toEqual([120, 60, 60]);
    expect(pooled.activityBouts.map((bout) => bout.durationSeconds)).toEqual([60, 60, 120]);
  });

  it("sees only what the monitor recorded, never the fly's hidden state", () => {
    // The scorer's input is the record of crossings alone: no Vigilance State, behaviour or
    // anything else from the Run Record can reach it.
    expectTypeOf(scoreBeamObservation).parameter(0).toEqualTypeOf<BeamObservation>();
    expectTypeOf<keyof BeamObservation>().toEqualTypeOf<
      "kind" | "binSeconds" | "startSeconds" | "counts" | "died"
    >();
    expectTypeOf<BeamObservation["counts"]>().toEqualTypeOf<readonly number[]>();
  });
});
