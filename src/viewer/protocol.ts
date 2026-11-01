import type { FiredTransition, RunRecord, RunSample, RoomSetup } from "../engine";

export type ToSimulation =
  | { readonly type: "start"; readonly seed: number; readonly room: RoomSetup }
  | { readonly type: "request-record"; readonly requestId: number };

export type FromSimulation =
  | {
      readonly type: "frame";
      readonly sample: RunSample;
      /** Transitions fired since the previous frame. */
      readonly fired: readonly FiredTransition[];
    }
  | { readonly type: "record"; readonly requestId: number; readonly record: RunRecord };
