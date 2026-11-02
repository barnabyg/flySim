import * as THREE from "three";
import { lightLevel, type LightSchedule, type RunRecord, type RunSample } from "../engine";
import { createDriverPanel, type FlashedTransition } from "./driverPanel";
import { createRibbon } from "./ribbon";
import { createRoomScene } from "./roomScene";
import { createRunControls } from "./runControls";
import { randomSeed, settingsFromUrl, urlForSettings, type RunSettings } from "./runSettings";
import { startSimulation } from "./simulationClient";
import { INITIAL_SPEED, SPEEDS, createTimeControls } from "./timeControls";
import { createViews, type ViewState } from "./views";

/** Lets browser tests and the console observe a run. It can't change one. */
export interface FlySimApi {
  readonly seed: number;
  current(): RunSample | undefined;
  record(): Promise<RunRecord>;
  flyScenePosition(): { x: number; y: number; z: number };
  flashes(): readonly FlashedTransition[];
  view(): ViewState;
}

declare global {
  interface Window {
    flySim: FlySimApi;
  }
}

function requireElement<T extends Element>(selector: string, type: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing element: ${selector}`);
  return element;
}

const settings = settingsFromUrl(location.search, SPEEDS, INITIAL_SPEED);
const { room, seed, lightSchedule } = settings;
let speed = settings.speed;

function restartWith(changes: Partial<RunSettings>): void {
  location.assign(urlForSettings({ ...settings, speed, ...changes }));
}

const view = requireElement("#view", HTMLElement);
const canvas = requireElement("#scene", HTMLCanvasElement);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const roomScene = createRoomScene(room);
const simulation = startSimulation(seed, room, speed, lightSchedule);

const driverPanel = createDriverPanel(requireElement("#drivers", HTMLElement));
const ribbon = createRibbon(requireElement("#ribbon", HTMLCanvasElement));
ribbon.setSpeed(speed);
const timeControls = createTimeControls(
  requireElement("#controls", HTMLElement),
  speed,
  lightSchedule,
  {
    onSpeedChange: (newSpeed) => {
      speed = newSpeed;
      simulation.setSpeed(newSpeed);
      ribbon.setSpeed(newSpeed);
    },
    onPausedChange: (paused) => {
      simulation.setPaused(paused);
    },
  },
);
createRunControls(requireElement("#run-controls", HTMLElement), seed, room, lightSchedule, {
  onDisturb: () => {
    simulation.intervene({ type: "disturb" });
  },
  onLightScheduleChange: (newSchedule) => {
    simulation.intervene({ type: "light-schedule", lightSchedule: newSchedule });
  },
  onRestart: () => {
    restartWith({});
  },
  onNewSeed: () => {
    restartWith({ seed: randomSeed() });
  },
  onRoomChange: (newRoom) => {
    restartWith({ room: newRoom });
  },
});
/**
 * The latest schedule asked for. A change applies to the fly at the next step, which is
 * only once time resumes, but the Room and dial show it at once.
 */
let shownSchedule: LightSchedule = lightSchedule;
simulation.onFrame((sample, fired, interventions) => {
  for (const intervention of interventions) {
    if (intervention.type === "light-schedule") shownSchedule = intervention.lightSchedule;
  }
  driverPanel.update(sample, fired);
  ribbon.update(sample, fired, interventions);
  timeControls.showTime(sample.timeSeconds, sample.timeOfDayHours, shownSchedule);
});

const views = createViews({
  renderer,
  scene: roomScene.scene,
  model: roomScene.fly,
  room,
  view,
  inset: requireElement("#inset", HTMLElement),
});

renderer.setAnimationLoop(() => {
  const sample = simulation.latest();
  if (sample) {
    roomScene.updateFly(sample);
    roomScene.updateLighting(lightLevel(shownSchedule, sample.timeOfDayHours));
  }
  views.render();
  ribbon.draw();
});

window.flySim = {
  seed,
  current: () => simulation.latest(),
  record: () => simulation.record(),
  flyScenePosition: () => {
    const { x, y, z } = roomScene.fly.object.position;
    return { x, y, z };
  },
  flashes: () => driverPanel.flashes,
  view: () => views.state(),
};
