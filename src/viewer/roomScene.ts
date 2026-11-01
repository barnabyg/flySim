import * as THREE from "three";
import type { Position, RoomSetup, RunSample } from "../engine";
import { createFlyModel } from "./flyModel";

/** Engine positions have z up, and the scene has y up. */
function toScene(position: Position): THREE.Vector3 {
  return new THREE.Vector3(position.x, position.z, position.y);
}

function createRoomMesh(room: RoomSetup): THREE.Object3D {
  const { widthMetres: width, depthMetres: depth, heightMetres: height } = room;
  const group = new THREE.Group();

  // Only the inner faces are drawn, so the near walls never block the view.
  const box = new THREE.BoxGeometry(width, height, depth);
  const walls = new THREE.Mesh(
    box,
    new THREE.MeshLambertMaterial({ color: 0xb9bcc2, side: THREE.BackSide }),
  );
  walls.position.set(width / 2, height / 2, depth / 2);
  group.add(walls);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({ color: 0x5b6069 }),
  );
  edges.position.copy(walls.position);
  group.add(edges);

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
