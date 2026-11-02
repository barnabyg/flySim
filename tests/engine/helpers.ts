import {
  DEFAULT_ROOM,
  createSimulationRun,
  type RunRecord,
  type SimulationSetup,
} from "../../src/engine";

/** The record of a run in the default Room, unless the setup says otherwise. */
export function recordOf(
  seed: number,
  simulatedSeconds: number,
  setup: Partial<Omit<SimulationSetup, "seed">> = {},
): RunRecord {
  const run = createSimulationRun({ room: DEFAULT_ROOM, ...setup, seed });
  run.advanceSeconds(simulatedSeconds);
  return run.record();
}
