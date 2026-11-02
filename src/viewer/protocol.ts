import type {
  FiredTransition,
  FloorPlace,
  Intervention,
  InterventionAction,
  LightSchedule,
  RunRecord,
  RunSample,
  RoomSetup,
} from "../engine";

export type ToSimulation =
  | {
      readonly type: "start";
      readonly seed: number;
      readonly room: RoomSetup;
      readonly speed: number;
      readonly lightSchedule: LightSchedule;
      readonly food: FloorPlace | undefined;
    }
  | { readonly type: "set-speed"; readonly speed: number }
  | { readonly type: "set-paused"; readonly paused: boolean }
  | { readonly type: "intervene"; readonly action: InterventionAction }
  | { readonly type: "request-record"; readonly requestId: number };

export type FromSimulation =
  | {
      readonly type: "frame";
      readonly sample: RunSample;
      /** Transitions fired since the previous frame. */
      readonly fired: readonly FiredTransition[];
      /** Interventions made since the previous frame. */
      readonly interventions: readonly Intervention[];
    }
  | { readonly type: "record"; readonly requestId: number; readonly record: RunRecord };
