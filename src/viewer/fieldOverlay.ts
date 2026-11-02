import * as THREE from "three";
import { odourField, type FloorPlace, type ModelParameters, type RoomSetup } from "../engine";

/** Pixels along the longer side of the floor's overlay texture. */
const TEXTURE_PIXELS = 256;
/** Above the floor's markings and the sources, so it draws over both. */
const FLOOR_HEIGHT_METRES = 0.00015;
const ODOUR_RGB = [166, 184, 74] as const;
const MAX_FLOOR_ALPHA = 0.75;
const SHELL_OPACITY = 0.12;

export interface FieldOverlay {
  readonly object: THREE.Object3D;
  setVisible(visible: boolean): void;
  visible(): boolean;
  /** Centres the Odour Field on the food, or removes it if there is none. */
  placeFood(place: FloorPlace | null): void;
}

/** The Room's six inner faces, so a field's shell stops at the walls as the field does. */
function roomClippingPlanes(room: RoomSetup): THREE.Plane[] {
  const { widthMetres: width, depthMetres: depth, heightMetres: height } = room;
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), width),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), height),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), depth),
  ];
}

/**
 * Shows what the fly could detect: the Odour Field's strength across the floor, and a faint
 * shell where its range ends, which reaches up the walls. It draws the engine's own field,
 * so it can't show anything the fly doesn't sense. It needs the renderer's local clipping.
 */
export function createFieldOverlay(room: RoomSetup, parameters: ModelParameters): FieldOverlay {
  const object = new THREE.Group();
  object.visible = false;
  const clippingPlanes = roomClippingPlanes(room);

  const scale = TEXTURE_PIXELS / Math.max(room.widthMetres, room.depthMetres);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(room.widthMetres * scale));
  canvas.height = Math.max(1, Math.round(room.depthMetres * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context for the field overlay");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.widthMetres, room.depthMetres),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      // So close to the floor, depth alone can't keep it in front from far off.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  // Faces up, with the canvas's top row along the south wall, where y is 0.
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.widthMetres / 2, FLOOR_HEIGHT_METRES, room.depthMetres / 2);
  object.add(floor);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24, 0, 2 * Math.PI, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(`rgb(${ODOUR_RGB.join(",")})`),
      transparent: true,
      opacity: SHELL_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false,
      clippingPlanes,
    }),
  );
  shell.scale.setScalar(parameters.odourRangeMetres);
  object.add(shell);

  function drawFloor(food: FloorPlace | null): void {
    if (!context) return;
    const image = context.createImageData(canvas.width, canvas.height);
    for (let row = 0; row < canvas.height; row++) {
      for (let column = 0; column < canvas.width; column++) {
        const at = { x: (column + 0.5) / scale, y: (row + 0.5) / scale, z: 0 };
        const odour = odourField(food, parameters.odourRangeMetres, at);
        const i = 4 * (row * canvas.width + column);
        image.data.set([...ODOUR_RGB, Math.round(255 * MAX_FLOOR_ALPHA * Math.sqrt(odour))], i);
      }
    }
    context.putImageData(image, 0, 0);
    texture.needsUpdate = true;
  }

  /** The place last drawn, so that redrawing happens only when the food moves. */
  let shownKey: string | undefined;

  return {
    object,
    setVisible: (visible) => {
      object.visible = visible;
    },
    visible: () => object.visible,
    placeFood: (place) => {
      const key = place ? `${place.x},${place.y}` : "none";
      if (key === shownKey) return;
      shownKey = key;
      drawFloor(place);
      shell.visible = place !== null && parameters.odourRangeMetres > 0;
      if (place) shell.position.set(place.x, 0, place.y);
    },
  };
}
