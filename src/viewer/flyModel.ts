import * as THREE from "three";

/** An adult male's body length. The model is built at this size and never scaled. */
export const FLY_LENGTH_METRES = 0.0025;

const BODY_RADIUS_METRES = 0.0004;

/** A simple true-scale marker that stands in for the fly, facing +x. */
export function createFlyModel(): THREE.Object3D {
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(BODY_RADIUS_METRES, FLY_LENGTH_METRES - 2 * BODY_RADIUS_METRES),
    new THREE.MeshLambertMaterial({ color: 0x3a2412 }),
  );
  body.rotation.z = Math.PI / 2;
  body.position.y = BODY_RADIUS_METRES;

  const fly = new THREE.Group();
  fly.add(body);
  return fly;
}
