import type {
  FiredTransition,
  Intervention,
  InterventionAction,
  RunRecord,
  RunSample,
  SimulationSetup,
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
  /** The setup that replays the run, with every Intervention so far. */
  replaySetup(): Promise<SimulationSetup>;
}

/** A request to the worker, which the client gives an id to match its reply. */
type Request<Message = Extract<ToSimulation, { requestId: number }>> = Message extends unknown
  ? Omit<Message, "requestId">
  : never;

type Reply = Extract<FromSimulation, { requestId: number }>;

/** The viewer's only link to the engine, which runs off the rendering thread. */
export function startSimulation(setup: SimulationSetup, speed: number): SimulationClient {
  const worker = new Worker(new URL("./simulationWorker.ts", import.meta.url), { type: "module" });
  const listeners: FrameListener[] = [];
  const pendingReplies = new Map<number, (reply: Reply) => void>();
  let latest: RunSample | undefined;
  let nextRequestId = 0;

  function send(message: ToSimulation): void {
    worker.postMessage(message);
  }

  function request(message: Request): Promise<Reply> {
    return new Promise((resolve) => {
      const requestId = nextRequestId++;
      pendingReplies.set(requestId, resolve);
      send({ ...message, requestId });
    });
  }

  worker.onmessage = (event: MessageEvent<FromSimulation>) => {
    const message = event.data;
    if (message.type === "frame") {
      latest = message.sample;
      for (const listener of listeners) {
        listener(message.sample, message.fired, message.interventions);
      }
      return;
    }
    pendingReplies.get(message.requestId)?.(message);
    pendingReplies.delete(message.requestId);
  };

  send({ type: "start", setup, speed });

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
    record: async () => {
      const reply = await request({ type: "request-record" });
      if (reply.type !== "record") throw new Error(`Expected a record, not a ${reply.type}`);
      return reply.record;
    },
    replaySetup: async () => {
      const reply = await request({ type: "request-replay" });
      if (reply.type !== "replay") throw new Error(`Expected a replay, not a ${reply.type}`);
      return reply.setup;
    },
  };
}
