import * as THREE from "three";
import type { RunSample } from "../engine";

const MILLIMETRE = 0.001;

/** An adult male's body length. The model is built at this size and never scaled. */
export const FLY_LENGTH_METRES = 2.5 * MILLIMETRE;

/** The height of the thorax's centre when standing, which the close-up aims at. */
export const FLY_CENTRE_HEIGHT_METRES = 0.62 * MILLIMETRE;

const FEMUR_LENGTH = 0.7 * MILLIMETRE;
const TIBIA_LENGTH = 0.75 * MILLIMETRE;
/** A tarsus lies from the end of the tibia down to the foot, as this run and rise. */
const TARSUS_RUN = 0.3 * MILLIMETRE;
const TARSUS_RISE = 0.12 * MILLIMETRE;
const LEG_RADIUS = 0.035 * MILLIMETRE;

/**
 * How far the body travels in one full gait cycle. Half of each cycle is stance, when a
 * foot moves back along the body by half this, so a planted foot doesn't slide.
 */
const STRIDE_LENGTH_METRES = 1.6 * MILLIMETRE;
const FOOT_SWING = STRIDE_LENGTH_METRES / 4;
const FOOT_LIFT = 0.25 * MILLIMETRE;

const LEG_COLOUR = 0x2a1c10;
const BODY_COLOUR = 0x6b4a24;
const ABDOMEN_PALE_COLOUR = 0x7a5a2e;
const ABDOMEN_DARK_COLOUR = 0x1e140c;
const EYE_COLOUR = 0x8f1d1d;

export interface FlyModel {
  /** The whole fly, with its origin on the surface beneath the thorax, facing +x and up +y. */
  readonly object: THREE.Object3D;
  /** The head, thorax and abdomen, whose length is the fly's body length. */
  readonly body: THREE.Object3D;
  readonly feet: readonly THREE.Object3D[];
  /** Poses the fly from simulated behaviour alone, so it can't show what the model isn't doing. */
  animate(sample: RunSample): void;
}

interface Leg {
  readonly hip: THREE.Vector3;
  readonly restingFoot: THREE.Vector3;
  /** 1 or -1 for the fly's two sides, along z. */
  readonly side: number;
  /** The start of this leg's gait cycle, as a share of the cycle. */
  readonly gaitOffset: number;
  readonly femur: THREE.Mesh;
  readonly tibia: THREE.Mesh;
  readonly tarsus: THREE.Mesh;
  readonly foot: THREE.Object3D;
}

function ellipsoid(
  radii: { x: number; y: number; z: number },
  centre: { x: number; y: number; z: number },
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, 32, 24);
  geometry.scale(radii.x * MILLIMETRE, radii.y * MILLIMETRE, radii.z * MILLIMETRE);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(centre.x * MILLIMETRE, centre.y * MILLIMETRE, centre.z * MILLIMETRE);
  return mesh;
}

/** Pale bands with dark edges, and the dark tip that marks a male. */
function createAbdomen(): THREE.Mesh {
  const abdomen = ellipsoid(
    { x: 0.55, y: 0.36, z: 0.38 },
    { x: -0.7, y: 0.55, z: 0 },
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  const positions = abdomen.geometry.getAttribute("position");
  const pale = new THREE.Color(ABDOMEN_PALE_COLOUR);
  const dark = new THREE.Color(ABDOMEN_DARK_COLOUR);
  const colours: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    // From 0 at the rear tip to 5 at the thorax, one per visible segment.
    const along = (positions.getX(i) / (0.55 * MILLIMETRE) + 1) * 2.5;
    const isBand = along > 2 && along % 1 > 0.35;
    colours.push(...(isBand ? pale : dark).toArray());
  }
  abdomen.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return abdomen;
}

function createBody(): THREE.Object3D {
  const cuticle = new THREE.MeshLambertMaterial({ color: BODY_COLOUR });
  const eye = new THREE.MeshLambertMaterial({ color: EYE_COLOUR });
  const body = new THREE.Group();
  body.add(createAbdomen());
  body.add(ellipsoid({ x: 0.6, y: 0.4, z: 0.42 }, { x: 0.3, y: 0.62, z: 0 }, cuticle));
  body.add(ellipsoid({ x: 0.22, y: 0.3, z: 0.36 }, { x: 1.03, y: 0.68, z: 0 }, cuticle));
  for (const side of [1, -1]) {
    body.add(ellipsoid({ x: 0.2, y: 0.27, z: 0.14 }, { x: 1.03, y: 0.7, z: side * 0.28 }, eye));
  }
  return body;
}

function createWing(side: number): THREE.Mesh {
  const length = 2.1 * MILLIMETRE;
  const shape = new THREE.Shape();
  shape.absellipse(-length / 2, 0, length / 2, 0.38 * MILLIMETRE, 0, 2 * Math.PI);
  const geometry = new THREE.ShapeGeometry(shape, 24);
  geometry.rotateX(Math.PI / 2);
  const wing = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      color: 0xc8ccd0,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  wing.position.set(0.35 * MILLIMETRE, 0.98 * MILLIMETRE, side * 0.14 * MILLIMETRE);
  wing.rotation.y = side * 0.1;
  wing.rotation.z = 0.05;
  return wing;
}

function createSegment(length: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(LEG_RADIUS, LEG_RADIUS, length, 8), material);
}

const SEGMENT_AXIS = new THREE.Vector3(0, 1, 0);

/** Lays a segment, whose length is fixed by its geometry, along a line between two points. */
function placeSegment(segment: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  segment.position.addVectors(from, to).multiplyScalar(0.5);
  segment.quaternion.setFromUnitVectors(SEGMENT_AXIS, to.clone().sub(from).normalize());
}

/** Solves the knee between the hip and the tarsus, then lays the leg's segments to reach the foot. */
function poseLeg(leg: Leg, foot: THREE.Vector3): void {
  const towardsHip = new THREE.Vector3(leg.hip.x - foot.x, 0, leg.hip.z - foot.z);
  towardsHip.setLength(TARSUS_RUN);
  const ankle = foot.clone().add(towardsHip);
  ankle.y += TARSUS_RISE;

  const direction = ankle.clone().sub(leg.hip);
  const distance = THREE.MathUtils.clamp(
    direction.length(),
    Math.abs(FEMUR_LENGTH - TIBIA_LENGTH) + 1e-6,
    FEMUR_LENGTH + TIBIA_LENGTH - 1e-6,
  );
  direction.normalize();
  const alongLine =
    (FEMUR_LENGTH * FEMUR_LENGTH - TIBIA_LENGTH * TIBIA_LENGTH + distance * distance) /
    (2 * distance);
  const offLine = Math.sqrt(FEMUR_LENGTH * FEMUR_LENGTH - alongLine * alongLine);
  // Knees bend up and outwards, which keeps them clear of the body.
  const bend = new THREE.Vector3(0, 0.6, leg.side * 0.8);
  bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  const knee = leg.hip.clone().addScaledVector(direction, alongLine).addScaledVector(bend, offLine);

  placeSegment(leg.femur, leg.hip, knee);
  placeSegment(leg.tibia, knee, ankle);
  placeSegment(leg.tarsus, ankle, foot);
  leg.foot.position.copy(foot);
}

function createLegs(parent: THREE.Object3D): Leg[] {
  const material = new THREE.MeshLambertMaterial({ color: LEG_COLOUR });
  const tarsusLength = Math.hypot(TARSUS_RUN, TARSUS_RISE);
  // Hips and resting feet in millimetres, for the fly's +z side, front to back.
  const layout = [
    { hipX: 0.5, footX: 1.0, footZ: 0.95, gaitOffset: 0 },
    { hipX: 0.2, footX: 0.1, footZ: 1.15, gaitOffset: 0.5 },
    { hipX: -0.1, footX: -0.8, footZ: 1.0, gaitOffset: 0 },
  ];

  return [1, -1].flatMap((side) =>
    layout.map(({ hipX, footX, footZ, gaitOffset }) => {
      const leg: Leg = {
        hip: new THREE.Vector3(hipX, 0.38, side * 0.2).multiplyScalar(MILLIMETRE),
        restingFoot: new THREE.Vector3(footX, 0, side * footZ).multiplyScalar(MILLIMETRE),
        side,
        // The two sides are half a cycle apart, which makes two alternating tripods.
        gaitOffset: side === 1 ? gaitOffset : (gaitOffset + 0.5) % 1,
        femur: createSegment(FEMUR_LENGTH, material),
        tibia: createSegment(TIBIA_LENGTH, material),
        tarsus: createSegment(tarsusLength, material),
        foot: new THREE.Object3D(),
      };
      parent.add(leg.femur, leg.tibia, leg.tarsus, leg.foot);
      return leg;
    }),
  );
}

/** A foot's place in the gait: planted and moving back, then lifted and swinging forward. */
function gaitFoot(leg: Leg, stridePhase: number, lifted: boolean): THREE.Vector3 {
  const phase = (stridePhase + leg.gaitOffset) % 1;
  const isStance = phase < 0.5;
  const along = isStance ? 1 - 4 * phase : 4 * (phase - 0.5) - 1;
  const lift = lifted && !isStance ? Math.sin(2 * Math.PI * (phase - 0.5)) * FOOT_LIFT : 0;
  return leg.restingFoot.clone().add(new THREE.Vector3(along * FOOT_SWING, lift, 0));
}

/** A procedural fly built in code. Replacing it touches nothing outside this module's interface. */
export function createFlyModel(): FlyModel {
  const object = new THREE.Group();
  const body = createBody();
  object.add(body);
  for (const side of [1, -1]) object.add(createWing(side));
  const legs = createLegs(object);

  let stridePhase = 0;
  let previousTimeSeconds = 0;

  function animate(sample: RunSample): void {
    const elapsedSeconds = Math.max(0, sample.timeSeconds - previousTimeSeconds);
    previousTimeSeconds = sample.timeSeconds;
    const walking = sample.behaviour === "walking";
    if (walking) {
      stridePhase =
        (stridePhase + (sample.speedMetresPerSecond * elapsedSeconds) / STRIDE_LENGTH_METRES) % 1;
    }
    // When walking stops, all six feet go down where they are, and then nothing moves.
    for (const leg of legs) poseLeg(leg, gaitFoot(leg, stridePhase, walking));
  }

  for (const leg of legs) poseLeg(leg, gaitFoot(leg, stridePhase, false));

  return { object, body, feet: legs.map((leg) => leg.foot), animate };
}
