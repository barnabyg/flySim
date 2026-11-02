import type {
  FiredTransition,
  Intervention,
  InterventionAction,
  RunRecord,
  RunSample,
  SimulationSetup,
} from "../engine";

/** The forms a run can be exported in. */
export type ExportFormat = "json";

/** A gzipped file ready to download. */
export interface ExportedFile {
  readonly name: string;
  readonly data: ArrayBuffer;
}

export type ToSimulation =
  | { readonly type: "start"; readonly setup: SimulationSetup; readonly speed: number }
  | { readonly type: "set-speed"; readonly speed: number }
  | { readonly type: "set-paused"; readonly paused: boolean }
  | { readonly type: "intervene"; readonly action: InterventionAction }
  | { readonly type: "request-record"; readonly requestId: number }
  | { readonly type: "request-replay"; readonly requestId: number }
  | {
      readonly type: "request-export";
      readonly requestId: number;
      readonly format: ExportFormat;
      readonly sampleIntervalSeconds: number;
    };

export type FromSimulation =
  | {
      readonly type: "frame";
      readonly sample: RunSample;
      /** Transitions fired since the previous frame. */
      readonly fired: readonly FiredTransition[];
      /** Interventions made or reached since the previous frame. */
      readonly interventions: readonly Intervention[];
    }
  | { readonly type: "record"; readonly requestId: number; readonly record: RunRecord }
  /** The run's setup with every Intervention so far, including any replayed but not yet reached. */
  | { readonly type: "replay"; readonly requestId: number; readonly setup: SimulationSetup }
  | {
      readonly type: "export";
      readonly requestId: number;
      readonly files: readonly ExportedFile[];
    };
