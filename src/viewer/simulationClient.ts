import type { FiredTransition, RoomSetup, RunRecord, RunSample } from "../engine";
import type { FromSimulation, ToSimulation } from "./protocol";

export interface SimulationClient {
  /** The latest state received, or undefined until the first frame arrives. */
  latest(): RunSample | undefined;
  onFrame(listener: (sample: RunSample, fired: readonly FiredTransition[]) => void): void;
  setSpeed(speed: number): void;
  setPaused(paused: boolean): void;
  record(): Promise<RunRecord>;
}

/** The viewer's only link to the engine, which runs off the rendering thread. */
export function startSimulation(seed: number, room: RoomSetup, speed: number): SimulationClient {
  const worker = new Worker(new URL("./simulationWorker.ts", import.meta.url), { type: "module" });
  const listeners: ((sample: RunSample, fired: readonly FiredTransition[]) => void)[] = [];
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
        for (const listener of listeners) listener(message.sample, message.fired);
        break;
      case "record":
        pendingRecords.get(message.requestId)?.(message.record);
        pendingRecords.delete(message.requestId);
        break;
    }
  };

  send({ type: "start", seed, room, speed });

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
    record: () =>
      new Promise((resolve) => {
        const requestId = nextRequestId++;
        pendingRecords.set(requestId, resolve);
        send({ type: "request-record", requestId });
      }),
  };
}
