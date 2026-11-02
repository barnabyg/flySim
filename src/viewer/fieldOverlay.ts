import * as THREE from "three";
import {
  SOURCE_KINDS,
  humidityField,
  odourField,
  type FloorPlace,
  type ModelParameters,
  type RoomSetup,
  type SourceKind,
} from "../engine";

/** Pixels along the longer side of the floor's overlay texture. */
const TEXTURE_PIXELS = 256;
/** Above the floor's markings and the sources, so it draws over both. */
const FLOOR_HEIGHT_METRES = 0.00015;
/** Olive for odour and pale blue for humidity, which can't be taken for each other. */
export const FIELD_RGB: Readonly<Record<SourceKind, readonly [number, number, number]>> = {
  food: [166, 184, 74],
  water: [90, 160, 235],
};
const MAX_FLOOR_ALPHA = 0.75;
const SHELL_OPACITY = 0.12;

export interface FieldOverlay {
  readonly object: THREE.Object3D;
  setVisible(visible: boolean): void;
  visible(): boolean;
  /** Centres a source's field on it, or removes the field if there is no source. */
  placeSource(kind: SourceKind, place: FloorPlace | null): void;
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
 * Shows what the fly could detect: each field's strength across the floor, and a faint shell
 * where its range ends, which reaches up the walls. It draws the engine's own fields, so it
 * can't show anything the fly doesn't sense. It needs the renderer's local clipping.
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

  const ranges: Readonly<Record<SourceKind, number>> = {
    food: parameters.odourRangeMetres,
    water: parameters.humidityRangeMetres,
  };
  const shells = new Map(
    SOURCE_KINDS.map((kind) => {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 24, 0, 2 * Math.PI, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(`rgb(${FIELD_RGB[kind].join(",")})`),
          transparent: true,
          opacity: SHELL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          clippingPlanes,
        }),
      );
      shell.scale.setScalar(ranges[kind]);
      shell.visible = false;
      object.add(shell);
      return [kind, shell];
    }),
  );

  const places: Record<SourceKind, FloorPlace | null> = { food: null, water: null };

  /** Each field's strength, from 0 to 1, at a point. */
  function strengths(at: { x: number; y: number; z: number }): Record<SourceKind, number> {
    const { globalHumidity, humidityRise } = parameters;
    const humidity = humidityField(places.water, parameters, at);
    return {
      food: odourField(places.food, parameters.odourRangeMetres, at),
      water: humidityRise > 0 ? (humidity - globalHumidity) / humidityRise : 0,
    };
  }

  /** Mixes the two fields' colours in proportion to their strengths. */
  function drawFloor(): void {
    if (!context) return;
    const image = context.createImageData(canvas.width, canvas.height);
    for (let row = 0; row < canvas.height; row++) {
      for (let column = 0; column < canvas.width; column++) {
        const strength = strengths({ x: (column + 0.5) / scale, y: (row + 0.5) / scale, z: 0 });
        const total = strength.food + strength.water;
        if (total === 0) continue;
        const pixel = FIELD_RGB.food.map((odourChannel, channel) =>
          Math.round(
            (odourChannel * strength.food + (FIELD_RGB.water[channel] ?? 0) * strength.water) /
              total,
          ),
        );
        const alpha = MAX_FLOOR_ALPHA * Math.sqrt(Math.min(1, total));
        image.data.set([...pixel, Math.round(255 * alpha)], 4 * (row * canvas.width + column));
      }
    }
    context.putImageData(image, 0, 0);
    texture.needsUpdate = true;
  }

  /** The places last drawn, so that redrawing happens only when a source moves. */
  let drawnKey: string | undefined;

  return {
    object,
    setVisible: (visible) => {
      object.visible = visible;
    },
    visible: () => object.visible,
    placeSource: (kind, place) => {
      places[kind] = place;
      const shell = shells.get(kind);
      if (shell) {
        shell.visible = place !== null && ranges[kind] > 0;
        if (place) shell.position.set(place.x, 0, place.y);
      }
      const key = JSON.stringify(places);
      if (key === drawnKey) return;
      drawnKey = key;
      drawFloor();
    },
  };
}
