import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { RoomSetup } from "../engine";
import { FLY_LENGTH_METRES } from "./flyModel";
import {
  FIELD_OF_VIEW_DEGREES,
  createMonitoringCamera,
  frameRoom,
  roomCentre,
  roomCorners,
  type ScreenRegion,
} from "./monitoringCamera";
import { CLOSE_UP_ONLY_LAYER } from "./roomScene";

/** Only the monitoring camera sees this layer, so the close-up can never show the ring. */
const RING_LAYER = 1;
const RING_RADIUS_PIXELS = 11;
/** Above this drawn length, the fly can be found without help. */
const RING_MAX_FLY_PIXELS = 24;
const FLY_CENTRE_HEIGHT_METRES = 0.0004;
const CLOSE_UP_OFFSET = new THREE.Vector3(0.007, 0.006, 0.009);

export type CameraName = "monitoring" | "close-up";

export interface ViewState {
  readonly mainCamera: CameraName;
  readonly monitoringCameraPosition: { x: number; y: number; z: number };
  /** In normalised device coordinates, so a visible corner is within -1 to 1. */
  readonly roomCornersInMainView: readonly { x: number; y: number }[];
  readonly flyLengthInScene: number;
  readonly flyInCloseUp: { x: number; y: number };
  readonly closeUpDistance: number;
}

export interface Views {
  render(): void;
  state(): ViewState;
}

interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function createRing(): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffb020,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    }),
  );
  ring.layers.set(RING_LAYER);
  ring.renderOrder = 1;
  return ring;
}

/** Measures the fly as drawn, from its vertices, so any scaling would show up here. */
function drawnFlyLength(fly: THREE.Object3D): number {
  const size = new THREE.Box3().setFromObject(fly, true).getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z);
}

/**
 * The monitoring and close-up cameras, and which one fills the main view. They only
 * read the scene, and nothing here reaches the simulation.
 */
export function createViews(options: {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly fly: THREE.Object3D;
  readonly room: RoomSetup;
  readonly view: HTMLElement;
  readonly inset: HTMLElement;
}): Views {
  const { renderer, scene, fly, room, view, inset } = options;

  const monitoringCamera = createMonitoringCamera();
  monitoringCamera.layers.enable(RING_LAYER);

  const closeUpCamera = new THREE.PerspectiveCamera(FIELD_OF_VIEW_DEGREES, 1, 0.001, 5);
  closeUpCamera.layers.enable(CLOSE_UP_ONLY_LAYER);

  const ring = createRing();
  scene.add(ring);

  const controls = new OrbitControls(monitoringCamera, renderer.domElement);
  controls.target.copy(roomCentre(room));
  controls.enablePan = false;
  controls.enableZoom = false;
  // Stops just above the horizontal, so the camera can't go below the floor.
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  let swapped = false;
  let orbited = false;
  controls.addEventListener("start", () => {
    orbited = true;
  });

  inset.addEventListener("click", () => {
    swapped = !swapped;
    controls.enabled = !swapped;
    inset.setAttribute("aria-label", swapped ? "Show the monitoring camera" : "Show the close-up");
  });

  /** The inset's place within the view, with y measured from the bottom, as WebGL does. */
  function insetViewport(): Viewport {
    const viewBox = view.getBoundingClientRect();
    const box = inset.getBoundingClientRect();
    return {
      x: box.left - viewBox.left,
      y: viewBox.bottom - box.bottom,
      width: box.width,
      height: box.height,
    };
  }

  function insetScreenRegion(): ScreenRegion {
    const viewBox = view.getBoundingClientRect();
    const { x, y, width, height } = insetViewport();
    return {
      minX: (2 * x) / viewBox.width - 1,
      maxX: (2 * (x + width)) / viewBox.width - 1,
      minY: (2 * y) / viewBox.height - 1,
      maxY: (2 * (y + height)) / viewBox.height - 1,
    };
  }

  function fitToWindow(): void {
    const { clientWidth: width, clientHeight: height } = view;
    renderer.setSize(width, height, false);
    monitoringCamera.aspect = width / height;
    monitoringCamera.updateProjectionMatrix();
    // Once the experimenter has chosen an angle, a resize doesn't take it away.
    if (!orbited) frameRoom(monitoringCamera, room, insetScreenRegion());
  }
  new ResizeObserver(fitToWindow).observe(view);
  fitToWindow();

  function renderCamera(camera: THREE.PerspectiveCamera, viewport: Viewport): void {
    camera.aspect = viewport.width / viewport.height;
    camera.updateProjectionMatrix();
    renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
    renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
    renderer.render(scene, camera);
  }

  function flyCentre(): THREE.Vector3 {
    return new THREE.Vector3(0, FLY_CENTRE_HEIGHT_METRES, 0).add(fly.position);
  }

  function trackFly(): void {
    closeUpCamera.position.copy(fly.position).add(CLOSE_UP_OFFSET);
    closeUpCamera.lookAt(flyCentre());
    closeUpCamera.updateMatrixWorld();
  }

  /** Keeps the ring a fixed size on screen and facing the camera, and hides it when not needed. */
  function placeRing(viewportHeightPixels: number): void {
    const distance = monitoringCamera.position.distanceTo(fly.position);
    const halfFieldOfView = THREE.MathUtils.degToRad(monitoringCamera.fov / 2);
    const metresPerPixel = (2 * distance * Math.tan(halfFieldOfView)) / viewportHeightPixels;
    const flyLengthPixels = FLY_LENGTH_METRES / metresPerPixel;
    ring.visible = flyLengthPixels < RING_MAX_FLY_PIXELS;
    ring.position.copy(fly.position);
    ring.quaternion.copy(monitoringCamera.quaternion);
    ring.scale.setScalar(RING_RADIUS_PIXELS * metresPerPixel);
  }

  return {
    render: () => {
      trackFly();
      const full: Viewport = { x: 0, y: 0, width: view.clientWidth, height: view.clientHeight };
      const small = insetViewport();
      placeRing(swapped ? small.height : full.height);

      renderer.setScissorTest(true);
      renderCamera(swapped ? closeUpCamera : monitoringCamera, full);
      renderCamera(swapped ? monitoringCamera : closeUpCamera, small);
    },
    state: () => {
      const mainCamera = swapped ? closeUpCamera : monitoringCamera;
      const flyProjected = flyCentre().project(closeUpCamera);
      const { x, y, z } = monitoringCamera.position;
      return {
        mainCamera: swapped ? "close-up" : "monitoring",
        monitoringCameraPosition: { x, y, z },
        roomCornersInMainView: roomCorners(room).map((corner) => {
          const projected = corner.project(mainCamera);
          return { x: projected.x, y: projected.y };
        }),
        flyLengthInScene: drawnFlyLength(fly),
        flyInCloseUp: { x: flyProjected.x, y: flyProjected.y },
        closeUpDistance: closeUpCamera.position.distanceTo(fly.position),
      };
    },
  };
}
