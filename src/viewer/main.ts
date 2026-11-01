import * as THREE from "three";
import type { RunRecord, RunSample } from "../engine";
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
const { room, seed } = settings;
let speed = settings.speed;

function restartWith(changes: Partial<RunSettings>): void {
  location.assign(urlForSettings({ ...settings, speed, ...changes }));
}

const view = requireElement("#view", HTMLElement);
const canvas = requireElement("#scene", HTMLCanvasElement);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const roomScene = createRoomScene(room);
const simulation = startSimulation(seed, room, speed);

const driverPanel = createDriverPanel(requireElement("#drivers", HTMLElement));
const ribbon = createRibbon(requireElement("#ribbon", HTMLCanvasElement));
ribbon.setSpeed(speed);
const timeControls = createTimeControls(requireElement("#controls", HTMLElement), speed, {
  onSpeedChange: (newSpeed) => {
    speed = newSpeed;
    simulation.setSpeed(newSpeed);
    ribbon.setSpeed(newSpeed);
  },
  onPausedChange: (paused) => {
    simulation.setPaused(paused);
  },
});
createRunControls(requireElement("#run-controls", HTMLElement), seed, room, {
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
simulation.onFrame((sample, fired) => {
  driverPanel.update(sample, fired);
  ribbon.update(sample, fired);
  timeControls.showTime(sample.timeSeconds);
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
  if (sample) roomScene.updateFly(sample);
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
