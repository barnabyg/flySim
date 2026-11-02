import {
  STEPS_PER_SECOND,
  createSimulationRun,
  RUN_TABLE_NAMES,
  exportFileName,
  exportRun,
  exportTables,
  type RunExport,
  type SimulationRun,
  type SimulationSetup,
} from "../engine";
import { gzip } from "./gzip";
import type { ExportFormat, ExportedFile, FromSimulation, ToSimulation } from "./protocol";

const TICK_MILLISECONDS = 16;
/** The longest one tick may spend advancing, which keeps messages flowing at high speeds. */
const TICK_BUDGET_MILLISECONDS = 12;
const STEPS_PER_BATCH = 200;
/** A record's worth of samples to retain: about two simulated days at one per second. */
const MAX_RECORDED_SAMPLES = 200_000;

let speed = 1;
let paused = false;
let run: SimulationRun | undefined;
let setup: SimulationSetup | undefined;
let lastTickTime = 0;
let stepsOwed = 0;
let firedSent = 0;
let interventionsSent = 0;

function send(message: FromSimulation, transfer: Transferable[] = []): void {
  postMessage(message, { transfer });
}

function tick(): void {
  if (!run) return;
  const now = performance.now();
  const elapsedSeconds = (now - lastTickTime) / 1000;
  lastTickTime = now;
  // A dead fly's run goes no further.
  if (paused || run.current().death) return;
  stepsOwed += elapsedSeconds * speed * STEPS_PER_SECOND;

  // How many steps run in a tick depends on wall-clock time, but a run depends only
  // on its step count, so this can't affect the results.
  while (stepsOwed >= 1 && performance.now() - now < TICK_BUDGET_MILLISECONDS) {
    const steps = Math.min(Math.floor(stepsOwed), STEPS_PER_BATCH);
    run.advanceSteps(steps);
    stepsOwed -= steps;
  }
  // If the machine can't keep up, time runs slower instead of building up a backlog.
  stepsOwed = Math.min(stepsOwed, speed * STEPS_PER_SECOND);

  sendFrame();
}

function sendFrame(): void {
  if (!run) return;
  const sample = run.current();
  // A replay's Interventions show only once the run reaches them. One made now goes after any
  // already reached, and before any still to come, so those reached are always the first ones.
  const reached = run.interventions.findIndex((each) => each.step > sample.step);
  const interventionsReached = reached === -1 ? run.interventions.length : reached;
  send({
    type: "frame",
    sample,
    fired: run.firedTransitions.slice(firedSent),
    interventions: run.interventions.slice(interventionsSent, interventionsReached),
  });
  firedSent = run.firedTransitions.length;
  interventionsSent = interventionsReached;
}

/** Each export format's files, before they are zipped. */
const EXPORTERS: Readonly<
  Record<ExportFormat, (file: RunExport) => readonly { name: string; text: string }[]>
> = {
  json: (file) => [{ name: exportFileName(file, "", "json.gz"), text: JSON.stringify(file) }],
  csv: (file) => {
    const tables = exportTables(file);
    return RUN_TABLE_NAMES.map((name) => ({
      name: exportFileName(file, name, "csv.gz"),
      text: tables[name],
    }));
  },
};

/**
 * Exports the run here rather than in the viewer, as a long run's record is too big to pass over
 * without stalling the page. The run waits while its record is converted, and goes on while the
 * files are zipped.
 */
async function sendExport(
  requestId: number,
  format: ExportFormat,
  sampleIntervalSeconds: number,
): Promise<void> {
  if (!run) return;
  const file = exportRun(run.record(), sampleIntervalSeconds);
  const files: ExportedFile[] = await Promise.all(
    EXPORTERS[format](file).map(async ({ name, text }) => ({ name, data: await gzip(text) })),
  );
  send(
    { type: "export", requestId, files },
    files.map((each) => each.data),
  );
}

onmessage = (event: MessageEvent<ToSimulation>) => {
  const message = event.data;
  switch (message.type) {
    case "start":
      speed = message.speed;
      setup = message.setup;
      run = createSimulationRun({ ...setup, maxRecordedSamples: MAX_RECORDED_SAMPLES });
      lastTickTime = performance.now();
      setInterval(tick, TICK_MILLISECONDS);
      break;
    case "set-speed":
      speed = message.speed;
      break;
    case "set-paused":
      paused = message.paused;
      stepsOwed = 0;
      sendFrame();
      break;
    case "intervene":
      // A run whose fly has died can't change any more.
      if (!run || run.current().death) break;
      run.intervene(message.action);
      // Even while paused, so that the experimenter sees the press register at once.
      sendFrame();
      break;
    case "request-record":
      if (run) send({ type: "record", requestId: message.requestId, record: run.record() });
      break;
    case "request-replay":
      if (run && setup) {
        const interventions = [...run.interventions];
        send({ type: "replay", requestId: message.requestId, setup: { ...setup, interventions } });
      }
      break;
    case "request-export":
      void sendExport(message.requestId, message.format, message.sampleIntervalSeconds);
      break;
  }
};
