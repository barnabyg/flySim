import * as THREE from "three";
import type { Position, RoomSetup, RunSample } from "../engine";
import { createFlyModel } from "./flyModel";

/** Fine floor markings that would only be noise from the monitoring camera's distance. */
export const CLOSE_UP_ONLY_LAYER = 2;

const MARKING_HEIGHT_METRES = 0.00005;

/** Engine positions have z up, and the scene has y up. */
function toScene(position: Position): THREE.Vector3 {
  return new THREE.Vector3(position.x, position.z, position.y);
}

function createFloorMarkings(
  room: RoomSetup,
  spacingMetres: number,
  colour: number,
): THREE.Object3D {
  const { widthMetres: width, depthMetres: depth } = room;
  const points: THREE.Vector3[] = [];
  for (let x = spacingMetres; x < width; x += spacingMetres) {
    points.push(new THREE.Vector3(x, MARKING_HEIGHT_METRES, 0));
    points.push(new THREE.Vector3(x, MARKING_HEIGHT_METRES, depth));
  }
  for (let z = spacingMetres; z < depth; z += spacingMetres) {
    points.push(new THREE.Vector3(0, MARKING_HEIGHT_METRES, z));
    points.push(new THREE.Vector3(width, MARKING_HEIGHT_METRES, z));
  }
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: colour }),
  );
}

function createRoomMesh(room: RoomSetup): THREE.Object3D {
  const { widthMetres: width, depthMetres: depth, heightMetres: height } = room;
  const group = new THREE.Group();

  // Only the inner faces are drawn, so the near walls never block the view.
  const box = new THREE.BoxGeometry(width, height, depth);
  const walls = new THREE.Mesh(
    box,
    new THREE.MeshLambertMaterial({
      color: 0xb9bcc2,
      side: THREE.BackSide,
      // Keeps the floor markings from flickering against the floor.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  walls.position.set(width / 2, height / 2, depth / 2);
  group.add(walls);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({ color: 0x5b6069 }),
  );
  edges.position.copy(walls.position);
  group.add(edges);

  group.add(createFloorMarkings(room, 0.1, 0x8d9199));
  const fineMarkings = createFloorMarkings(room, 0.002, 0xa2a6ad);
  fineMarkings.layers.set(CLOSE_UP_ONLY_LAYER);
  group.add(fineMarkings);

  return group;
}

export interface RoomScene {
  readonly scene: THREE.Scene;
  readonly fly: THREE.Object3D;
  updateFly(sample: RunSample): void;
}

export function createRoomScene(room: RoomSetup): RoomScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161a);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2));
  const overhead = new THREE.PointLight(0xffffff, 1.5, 0, 1);
  overhead.position.set(room.widthMetres / 2, room.heightMetres * 0.95, room.depthMetres / 2);
  scene.add(overhead);
  scene.add(createRoomMesh(room));

  const fly = createFlyModel();
  scene.add(fly);

  return {
    scene,
    fly,
    updateFly: (sample) => {
      fly.position.copy(toScene(sample.position));
      // The scene's y-up axes reverse the sense of a rotation about the vertical.
      fly.rotation.y = -sample.heading;
    },
  };
}
