import * as THREE from "three";
import { DEFAULT_ROOM, type RunRecord, type RunSample } from "../engine";
import { createDriverPanel, type FlashedTransition } from "./driverPanel";
import { createMonitoringCamera, frameRoom } from "./monitoringCamera";
import { createRoomScene } from "./roomScene";
import { startSimulation } from "./simulationClient";

/** Lets browser tests and the console observe a run. It can't change one. */
export interface FlySimApi {
  readonly seed: number;
  current(): RunSample | undefined;
  record(): Promise<RunRecord>;
  flyScenePosition(): { x: number; y: number; z: number };
  flashes(): readonly FlashedTransition[];
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
const monitoringCamera = createMonitoringCamera();
const simulation = startSimulation(seed, room);

const driverPanel = createDriverPanel(requireElement("#drivers", HTMLElement));
simulation.onFrame((sample, fired) => {
  driverPanel.update(sample, fired);
});

function resize(): void {
  const { clientWidth: width, clientHeight: height } = view;
  renderer.setSize(width, height, false);
  monitoringCamera.aspect = width / height;
  monitoringCamera.updateProjectionMatrix();
  frameRoom(monitoringCamera, room);
}
new ResizeObserver(resize).observe(view);
resize();

renderer.setAnimationLoop(() => {
  const sample = simulation.latest();
  if (sample) roomScene.updateFly(sample);
  renderer.render(roomScene.scene, monitoringCamera);
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
};
