import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { RoomSetup } from "../engine";
import { FLY_CENTRE_HEIGHT_METRES, FLY_LENGTH_METRES, type FlyModel } from "./flyModel";
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
/** A true-scale shadow would be under a pixel wide, so like the ring it has a fixed drawn size. */
const SHADOW_RADIUS_PIXELS = 6;
const SHADOW_HEIGHT_METRES = 0.0002;
/** Above this drawn length, the fly can be found without help. */
const RING_MAX_FLY_PIXELS = 24;
/** Where the close-up sits along the fly's surface, before moving out from the surface. */
const CLOSE_UP_ALONG_SURFACE = new THREE.Vector3(0.007, 0, 0.009);
const CLOSE_UP_ACROSS_ROOM = new THREE.Vector3(0, 0.007, 0.009);
const CLOSE_UP_OUT_FROM_SURFACE_METRES = 0.006;
/** How much of the way the close-up swings to a new viewpoint in each frame. */
const CLOSE_UP_SWING = 0.12;

export type CameraName = "monitoring" | "close-up";

export interface ViewState {
  readonly mainCamera: CameraName;
  readonly monitoringCameraPosition: { x: number; y: number; z: number };
  /** In normalised device coordinates, so a visible corner is within -1 to 1. */
  readonly roomCornersInMainView: readonly { x: number; y: number }[];
  readonly flyLengthInScene: number;
  readonly flyInCloseUp: { x: number; y: number };
  readonly closeUpDistance: number;
  /** Where each foot is, in the scene. */
  readonly flyFeet: readonly { x: number; y: number; z: number }[];
  readonly flyPose: ReturnType<FlyModel["pose"]>;
  readonly shadow: { x: number; y: number; z: number; visible: boolean };
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

function createShadow(): THREE.Mesh {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  shadow.layers.set(RING_LAYER);
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}

/**
 * Measures the body as drawn, from its vertices and along its own axis, so any scaling
 * would show up here. Legs and wings reach beyond the body, as they do on a real fly.
 */
function drawnBodyLength(model: FlyModel): number {
  model.object.updateWorldMatrix(true, true);
  const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(model.object.quaternion);
  const vertex = new THREE.Vector3();
  let least = Infinity;
  let most = -Infinity;
  model.body.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    const positions = (part as THREE.Mesh).geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld);
      least = Math.min(least, vertex.dot(axis));
      most = Math.max(most, vertex.dot(axis));
    }
  });
  return most - least;
}

/**
 * The monitoring and close-up cameras, and which one fills the main view. They only
 * read the scene, and nothing here reaches the simulation.
 */
export function createViews(options: {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly model: FlyModel;
  readonly room: RoomSetup;
  readonly view: HTMLElement;
  readonly inset: HTMLElement;
}): Views {
  const { renderer, scene, model, room, view, inset } = options;
  const fly = model.object;

  const monitoringCamera = createMonitoringCamera();
  monitoringCamera.layers.enable(RING_LAYER);

  const closeUpCamera = new THREE.PerspectiveCamera(FIELD_OF_VIEW_DEGREES, 1, 0.001, 5);
  closeUpCamera.layers.enable(CLOSE_UP_ONLY_LAYER);

  const ring = createRing();
  scene.add(ring);
  const shadow = createShadow();
  scene.add(shadow);

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

  function flyUp(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(fly.quaternion);
  }

  function flyCentre(): THREE.Vector3 {
    return flyUp().multiplyScalar(FLY_CENTRE_HEIGHT_METRES).add(fly.position);
  }

  /**
   * A viewpoint out from the fly's surface and to one side, which keeps the close-up
   * looking into the Room on every surface and never straight along the vertical.
   */
  function closeUpViewpoint(): THREE.Vector3 {
    const up = flyUp();
    const along = Math.abs(up.y) > 0.5 ? CLOSE_UP_ALONG_SURFACE : CLOSE_UP_ACROSS_ROOM;
    const tangent = along.clone().addScaledVector(up, -along.dot(up));
    return tangent.addScaledVector(up, CLOSE_UP_OUT_FROM_SURFACE_METRES);
  }

  let closeUpOffset = closeUpViewpoint();

  function trackFly(): void {
    closeUpOffset = closeUpOffset.lerp(closeUpViewpoint(), CLOSE_UP_SWING);
    closeUpCamera.position.copy(fly.position).add(closeUpOffset);
    closeUpCamera.lookAt(flyCentre());
    closeUpCamera.updateMatrixWorld();
  }

  function metresPerPixelAt(point: THREE.Vector3, viewportHeightPixels: number): number {
    const distance = monitoringCamera.position.distanceTo(point);
    const halfFieldOfView = THREE.MathUtils.degToRad(monitoringCamera.fov / 2);
    return (2 * distance * Math.tan(halfFieldOfView)) / viewportHeightPixels;
  }

  /** Shows height: a shadow on the floor below the fly whenever it is off the floor. */
  function placeShadow(viewportHeightPixels: number): void {
    shadow.visible = fly.position.y > 0;
    shadow.position.set(fly.position.x, SHADOW_HEIGHT_METRES, fly.position.z);
    const metresPerPixel = metresPerPixelAt(shadow.position, viewportHeightPixels);
    shadow.scale.setScalar(SHADOW_RADIUS_PIXELS * metresPerPixel);
  }

  /** Keeps the ring a fixed size on screen and facing the camera, and hides it when not needed. */
  function placeRing(viewportHeightPixels: number): void {
    const metresPerPixel = metresPerPixelAt(fly.position, viewportHeightPixels);
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
      placeShadow(swapped ? small.height : full.height);

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
        flyLengthInScene: drawnBodyLength(model),
        flyInCloseUp: { x: flyProjected.x, y: flyProjected.y },
        closeUpDistance: closeUpCamera.position.distanceTo(fly.position),
        flyPose: model.pose(),
        shadow: {
          x: shadow.position.x,
          y: shadow.position.y,
          z: shadow.position.z,
          visible: shadow.visible,
        },
        flyFeet: model.feet.map((foot) => {
          const world = foot.getWorldPosition(new THREE.Vector3());
          return { x: world.x, y: world.y, z: world.z };
        }),
      };
    },
  };
}
