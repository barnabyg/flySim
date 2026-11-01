import * as THREE from "three";
import { DEFAULT_ROOM, type RunRecord, type RunSample } from "../engine";
import { createDriverPanel, type FlashedTransition } from "./driverPanel";
import { createRibbon } from "./ribbon";
import { createRoomScene } from "./roomScene";
import { startSimulation } from "./simulationClient";
import { INITIAL_SPEED, createTimeControls } from "./timeControls";
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

function seedFromUrl(): number {
  const parameter = new URLSearchParams(location.search).get("seed");
  const parsed = parameter === null ? NaN : Number(parameter);
  return Number.isInteger(parsed) ? parsed : Math.floor(Math.random() * 2 ** 31);
}

const room = DEFAULT_ROOM;
const seed = seedFromUrl();

const view = requireElement("#view", HTMLElement);
const canvas = requireElement("#scene", HTMLCanvasElement);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const roomScene = createRoomScene(room);
const simulation = startSimulation(seed, room, INITIAL_SPEED);

const driverPanel = createDriverPanel(requireElement("#drivers", HTMLElement));
const ribbon = createRibbon(requireElement("#ribbon", HTMLCanvasElement));
ribbon.setSpeed(INITIAL_SPEED);
const timeControls = createTimeControls(requireElement("#controls", HTMLElement), {
  onSpeedChange: (speed) => {
    simulation.setSpeed(speed);
    ribbon.setSpeed(speed);
  },
  onPausedChange: (paused) => {
    simulation.setPaused(paused);
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
  fly: roomScene.fly,
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
    const { x, y, z } = roomScene.fly.position;
    return { x, y, z };
  },
  flashes: () => driverPanel.flashes,
  view: () => views.state(),
};
