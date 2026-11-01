import * as THREE from "three";
import type { RoomSetup } from "../engine";

const VIEW_DIRECTION = new THREE.Vector3(0.75, 0.75, 1).normalize();
const FIELD_OF_VIEW_DEGREES = 35;
/** The share of the view the Room's corners may reach, leaving a small border. */
const FRAME_FILL = 0.92;

/** A rectangle of the view in normalised device coordinates. */
export interface ScreenRegion {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export function roomCorners(room: RoomSetup): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const x of [0, room.widthMetres]) {
    for (const y of [0, room.heightMetres]) {
      for (const z of [0, room.depthMetres]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  return corners;
}

export function roomCentre(room: RoomSetup): THREE.Vector3 {
  return new THREE.Vector3(room.widthMetres / 2, room.heightMetres / 2, room.depthMetres / 2);
}

export function createMonitoringCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(FIELD_OF_VIEW_DEGREES, 1, 0.01, 50);
}

function fits(
  camera: THREE.PerspectiveCamera,
  corners: readonly THREE.Vector3[],
  covered: ScreenRegion,
): boolean {
  return corners.every((corner) => {
    const { x, y } = corner.clone().project(camera);
    const isCovered = x > covered.minX && x < covered.maxX && y > covered.minY && y < covered.maxY;
    return Math.abs(x) <= FRAME_FILL && Math.abs(y) <= FRAME_FILL && !isCovered;
  });
}

/**
 * Moves the camera to the nearest point on its default line that shows the whole Room,
 * with no corner of it behind the covered region.
 */
export function frameRoom(
  camera: THREE.PerspectiveCamera,
  room: RoomSetup,
  covered: ScreenRegion,
): void {
  const corners = roomCorners(room);
  const centre = roomCentre(room);
  let near = 0.1;
  let far = 50;
  for (let i = 0; i < 30; i++) {
    const distance = (near + far) / 2;
    camera.position.copy(centre).addScaledVector(VIEW_DIRECTION, distance);
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    if (fits(camera, corners, covered)) far = distance;
    else near = distance;
  }
  camera.position.copy(centre).addScaledVector(VIEW_DIRECTION, far);
  camera.lookAt(centre);
  camera.updateMatrixWorld();
}
