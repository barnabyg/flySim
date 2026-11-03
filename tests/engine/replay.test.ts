import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_ROOM,
  STEPS_PER_SECOND,
  createSimulationRun,
  replaySetup,
  type InterventionAction,
  type RunRecord,
  type SimulationRun,
} from "../../src/engine";

const MINUTE = 60;

/** Advances a run in uneven steps, as the viewer would at any speed. */
function advanceUnevenly(run: SimulationRun, seconds: number): void {
  const until = run.current().step + seconds * STEPS_PER_SECOND;
  while (run.current().step < until) {
    run.advanceSteps(Math.min(337, until - run.current().step));
  }
}

/** Replays a recorded run from its start up to the step it reached. */
function replayOf(record: RunRecord): RunRecord {
  const replay = createSimulationRun(replaySetup(record));
  replay.advanceSteps(record.step);
  return replay.record();
}

/** A run with every kind of Intervention made live, part-way through a second. */
function runWithInterventions(seed: number): SimulationRun {
  const run = createSimulationRun({ room: DEFAULT_ROOM, seed });
  const actions: InterventionAction[] = [
    { type: "disturb" },
    { type: "light-schedule", lightSchedule: { lightsOnHour: 3, lightHours: 0 } },
    { type: "move-source", source: "food", place: { x: 0.7, y: 0.4 } },
    { type: "remove-source", source: "water" },
    { type: "disturb" },
    { type: "restore-source", source: "water" },
  ];
  for (const action of actions) {
    advanceUnevenly(run, 2 * MINUTE);
    run.intervene(action);
  }
  // Two in the same step stay in the order they were made.
  run.intervene({ type: "disturb" });
  advanceUnevenly(run, 5 * MINUTE);
  run.advanceSteps(17);
  return run;
}

describe("replaying a run", () => {
  it("gives the same Run Record as the run in which its Interventions were made live", () => {
    for (const seed of [1, 2, 3]) {
      const original = runWithInterventions(seed).record();
      expect(original.interventions).toHaveLength(7);
      expect(original.step % STEPS_PER_SECOND).toBe(17);

      expect(replayOf(original)).toEqual(original);
    }
  });

  it("records the step reached and the Trigger Level stream, which a replay needs", () => {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed: 4, triggerStream: 9 });
    run.advanceSteps(123);
    const record = run.record();

    expect(record.step).toBe(123);
    expect(record.triggerStream).toBe(9);
    expect(replayOf(record)).toEqual(record);
  });

  it("adds Interventions made during a replay, and the next replay includes both", () => {
    const original = runWithInterventions(5);
    // Interventions not yet reached are kept, as the viewer's Replay keeps them.
    const replay = createSimulationRun(
      replaySetup({ ...original.record(), interventions: original.interventions }),
    );
    advanceUnevenly(replay, 3 * MINUTE);
    replay.intervene({ type: "disturb" });
    advanceUnevenly(replay, 20 * MINUTE);
    const first = replay.record();

    expect(first.interventions).toHaveLength(8);
    expect(
      first.interventions.filter((each) => each.step === 3 * MINUTE * STEPS_PER_SECOND),
    ).toHaveLength(1);
    expect(replayOf(first)).toEqual(first);
    // The new Disturb changed what happened after it.
    const before = original.record();
    const after = (record: RunRecord) =>
      record.samples.filter((sample) => sample.timeSeconds > 3 * MINUTE).slice(0, 600);
    expect(after(first)).not.toEqual(after(before));
  });

  it("ends in the same death at the same step", () => {
    const run = createSimulationRun({
      room: DEFAULT_ROOM,
      seed: 8,
      parameters: { ...DEFAULT_PARAMETERS, initialHydration: 0.01 },
    });
    run.advanceSeconds(30);
    run.intervene({ type: "remove-source", source: "water" });
    while (!run.current().death) run.advanceSteps(1000);
    const original = run.record();
    expect(original.death?.cause).toBe("desiccation");

    const replay = createSimulationRun(replaySetup(original));
    // Further steps change nothing, as the fly has died.
    replay.advanceSteps(original.step + 1000);
    expect(replay.record()).toEqual(original);
  });
});
