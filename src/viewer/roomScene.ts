import * as THREE from "three";
import type { Position, RoomSetup, RunSample } from "../engine";
import { createFlyModel, type FlyModel } from "./flyModel";

/** Fine markings that would only be noise from the monitoring camera's distance. */
export const CLOSE_UP_ONLY_LAYER = 2;

const MARKING_HEIGHT_METRES = 0.00005;
const AIR_TURNING_SECONDS = 0.05;
/** The Room stays dimly visible at night, so that the experimenter can still watch the fly. */
const NIGHT_BRIGHTNESS = 0.22;
const NIGHT_TINT = new THREE.Color(0x9fb4ff);
const DAY_TINT = new THREE.Color(0xffffff);
const DAY_BACKGROUND = new THREE.Color(0x14161a);
const NIGHT_BACKGROUND = new THREE.Color(0x07080c);
const HEMISPHERE_INTENSITY = 2;

/** Engine positions have z up, and the scene has y up. */
function toScene(position: Position): THREE.Vector3 {
  return new THREE.Vector3(position.x, position.z, position.y);
}

/** A grid of lines just inside one face of the Room, given the face's two axes. */
function pushFaceGrid(
  points: THREE.Vector3[],
  spacingMetres: number,
  [uSize, vSize]: readonly [number, number],
  place: (u: number, v: number) => THREE.Vector3,
): void {
  for (let u = spacingMetres; u < uSize; u += spacingMetres) {
    points.push(place(u, 0), place(u, vSize));
  }
  for (let v = spacingMetres; v < vSize; v += spacingMetres) {
    points.push(place(0, v), place(uSize, v));
  }
}

function createLines(points: readonly THREE.Vector3[], colour: number): THREE.Object3D {
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([...points]),
    new THREE.LineBasicMaterial({ color: colour }),
  );
}

function createFloorMarkings(
  room: RoomSetup,
  spacingMetres: number,
  colour: number,
): THREE.Object3D {
  const points: THREE.Vector3[] = [];
  pushFaceGrid(
    points,
    spacingMetres,
    [room.widthMetres, room.depthMetres],
    (x, z) => new THREE.Vector3(x, MARKING_HEIGHT_METRES, z),
  );
  return createLines(points, colour);
}

/** Lets the close-up show the fly's movement over every surface. */
function createFineMarkings(
  room: RoomSetup,
  spacingMetres: number,
  colour: number,
): THREE.Object3D {
  const { widthMetres: width, depthMetres: depth, heightMetres: height } = room;
  const inset = MARKING_HEIGHT_METRES;
  const points: THREE.Vector3[] = [];
  for (const y of [inset, height - inset]) {
    pushFaceGrid(points, spacingMetres, [width, depth], (u, v) => new THREE.Vector3(u, y, v));
  }
  for (const x of [inset, width - inset]) {
    pushFaceGrid(points, spacingMetres, [height, depth], (u, v) => new THREE.Vector3(x, u, v));
  }
  for (const z of [inset, depth - inset]) {
    pushFaceGrid(points, spacingMetres, [width, height], (u, v) => new THREE.Vector3(u, v, z));
  }
  return createLines(points, colour);
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
      // Keeps the markings from flickering against the floor.
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
  const fineMarkings = createFineMarkings(room, 0.002, 0xa2a6ad);
  fineMarkings.layers.set(CLOSE_UP_ONLY_LAYER);
  group.add(fineMarkings);

  return group;
}

export interface RoomScene {
  readonly scene: THREE.Scene;
  readonly fly: FlyModel;
  updateFly(sample: RunSample): void;
  /** Sets how bright the Room looks, from the overhead light's level. */
  updateLighting(lightLevel: number): void;
}

export function createRoomScene(room: RoomSetup): RoomScene {
  const scene = new THREE.Scene();
  const background = DAY_BACKGROUND.clone();
  scene.background = background;
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x888888, HEMISPHERE_INTENSITY);
  scene.add(hemisphere);
  // Brightness falls with distance, so a smaller Room needs a weaker light to look the same.
  const size = Math.max(room.widthMetres, room.depthMetres, room.heightMetres);
  const overheadIntensity = 1.5 * size;
  const overhead = new THREE.PointLight(0xffffff, overheadIntensity, 0, 1);
  overhead.position.set(room.widthMetres / 2, room.heightMetres * 0.95, room.depthMetres / 2);
  scene.add(overhead);
  scene.add(createRoomMesh(room));

  const fly = createFlyModel();
  scene.add(fly.object);
  const basis = new THREE.Matrix4();
  const target = new THREE.Quaternion();
  let previousTimeSeconds = 0;

  return {
    scene,
    fly,
    updateLighting: (lightLevel) => {
      const brightness = NIGHT_BRIGHTNESS + (1 - NIGHT_BRIGHTNESS) * lightLevel;
      hemisphere.intensity = HEMISPHERE_INTENSITY * brightness;
      hemisphere.color.lerpColors(NIGHT_TINT, DAY_TINT, lightLevel);
      overhead.intensity = overheadIntensity * brightness;
      overhead.color.lerpColors(NIGHT_TINT, DAY_TINT, lightLevel);
      background.lerpColors(NIGHT_BACKGROUND, DAY_BACKGROUND, lightLevel);
    },
    updateFly: (sample) => {
      fly.object.position.copy(toScene(sample.position));
      const forward = toScene(sample.forward);
      const up = toScene(sample.up);
      target.setFromRotationMatrix(
        basis.makeBasis(forward, up, new THREE.Vector3().crossVectors(forward, up)),
      );
      // Turns gradually in the air, where nothing is in the way. On a surface the body
      // matches the surface exactly, as any turn there would take it through a neighbour.
      const elapsedSeconds = sample.timeSeconds - previousTimeSeconds;
      previousTimeSeconds = sample.timeSeconds;
      const inAir = sample.surface === null;
      fly.object.quaternion.slerp(
        target,
        inAir ? 1 - Math.exp(-elapsedSeconds / AIR_TURNING_SECONDS) : 1,
      );
      fly.animate(sample);
    },
  };
}
