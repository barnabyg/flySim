import { STEPS_PER_SECOND, createSimulationRun, type SimulationRun } from "../engine";
import type { FromSimulation, ToSimulation } from "./protocol";

const TICK_MILLISECONDS = 16;
/** The longest one tick may spend advancing, which keeps messages flowing at high speeds. */
const TICK_BUDGET_MILLISECONDS = 12;
const STEPS_PER_BATCH = 200;
/** A record's worth of samples to retain: about two simulated days at one per second. */
const MAX_RECORDED_SAMPLES = 200_000;

const speed = 60;

let run: SimulationRun | undefined;
let lastTickTime = 0;
let stepsOwed = 0;
let firedSent = 0;

function send(message: FromSimulation): void {
  postMessage(message);
}

function tick(): void {
  if (!run) return;
  const now = performance.now();
  stepsOwed += ((now - lastTickTime) / 1000) * speed * STEPS_PER_SECOND;
  lastTickTime = now;

  // How many steps run in a tick depends on wall-clock time, but a run depends only
  // on its step count, so this can't affect the results.
  while (stepsOwed >= 1 && performance.now() - now < TICK_BUDGET_MILLISECONDS) {
    const steps = Math.min(Math.floor(stepsOwed), STEPS_PER_BATCH);
    run.advanceSteps(steps);
    stepsOwed -= steps;
  }
  // If the machine can't keep up, time runs slower instead of building up a backlog.
  stepsOwed = Math.min(stepsOwed, speed * STEPS_PER_SECOND);

  send({
    type: "frame",
    sample: run.current(),
    fired: run.firedTransitions.slice(firedSent),
  });
  firedSent = run.firedTransitions.length;
}

onmessage = (event: MessageEvent<ToSimulation>) => {
  const message = event.data;
  switch (message.type) {
    case "start":
      run = createSimulationRun({
        room: message.room,
        seed: message.seed,
        maxRecordedSamples: MAX_RECORDED_SAMPLES,
      });
      lastTickTime = performance.now();
      setInterval(tick, TICK_MILLISECONDS);
      break;
    case "request-record":
      if (run) send({ type: "record", requestId: message.requestId, record: run.record() });
      break;
  }
};
