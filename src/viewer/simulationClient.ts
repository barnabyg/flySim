import type {
  FiredTransition,
  FloorPlace,
  Intervention,
  InterventionAction,
  LightSchedule,
  SourceKind,
  RoomSetup,
  RunRecord,
  RunSample,
} from "../engine";
import type { FromSimulation, ToSimulation } from "./protocol";

export type FrameListener = (
  sample: RunSample,
  fired: readonly FiredTransition[],
  interventions: readonly Intervention[],
) => void;

export interface SimulationClient {
  /** The latest state received, or undefined until the first frame arrives. */
  latest(): RunSample | undefined;
  onFrame(listener: FrameListener): void;
  setSpeed(speed: number): void;
  setPaused(paused: boolean): void;
  intervene(action: InterventionAction): void;
  record(): Promise<RunRecord>;
}

/** The viewer's only link to the engine, which runs off the rendering thread. */
export function startSimulation(
  seed: number,
  room: RoomSetup,
  speed: number,
  lightSchedule: LightSchedule,
  sources: Partial<Readonly<Record<SourceKind, FloorPlace>>>,
): SimulationClient {
  const worker = new Worker(new URL("./simulationWorker.ts", import.meta.url), { type: "module" });
  const listeners: FrameListener[] = [];
  const pendingRecords = new Map<number, (record: RunRecord) => void>();
  let latest: RunSample | undefined;
  let nextRequestId = 0;

  function send(message: ToSimulation): void {
    worker.postMessage(message);
  }

  worker.onmessage = (event: MessageEvent<FromSimulation>) => {
    const message = event.data;
    switch (message.type) {
      case "frame":
        latest = message.sample;
        for (const listener of listeners) {
          listener(message.sample, message.fired, message.interventions);
        }
        break;
      case "record":
        pendingRecords.get(message.requestId)?.(message.record);
        pendingRecords.delete(message.requestId);
        break;
    }
  };

  send({ type: "start", seed, room, speed, lightSchedule, sources });

  return {
    latest: () => latest,
    onFrame: (listener) => {
      listeners.push(listener);
    },
    setSpeed: (newSpeed) => {
      send({ type: "set-speed", speed: newSpeed });
    },
    setPaused: (paused) => {
      send({ type: "set-paused", paused });
    },
    intervene: (action) => {
      send({ type: "intervene", action });
    },
    record: () =>
      new Promise((resolve) => {
        const requestId = nextRequestId++;
        pendingRecords.set(requestId, resolve);
        send({ type: "request-record", requestId });
      }),
  };
}
