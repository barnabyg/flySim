import * as THREE from "three";
import {
  SOURCE_KINDS,
  SOURCE_RADIUS_METRES,
  type FloorPlace,
  type RoomSetup,
  type SourceKind,
} from "../engine";

/** A press this close to a source's centre picks it up, which is easier than its true size. */
const PICK_RADIUS_METRES = 2 * SOURCE_RADIUS_METRES;

export interface SourceDraggingOptions {
  /** The element around the canvas, whose events reach this before the camera's controls. */
  readonly view: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly room: RoomSetup;
  /** The camera to drag in, or undefined while dragging isn't possible. */
  camera(): THREE.Camera | undefined;
  /** Where each source is shown, or null if it isn't in the Room. */
  shownPlace(kind: SourceKind): FloorPlace | null;
  setOrbitEnabled(enabled: boolean): void;
  /** While dragging, so the source can follow the pointer. */
  onDrag(kind: SourceKind, place: FloorPlace): void;
  /** When the source is let go, which is when it moves in the run. */
  onDrop(kind: SourceKind, place: FloorPlace): void;
}

/**
 * Drags the food and water across the floor of the main view. A press on a source takes the
 * drag from the camera's controls, so it doesn't also orbit, and the source stays on the
 * floor and inside the Room wherever the pointer goes.
 */
export function createSourceDragging(options: SourceDraggingOptions): void {
  const { view, canvas, room } = options;
  const raycaster = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let dragging:
    | {
        kind: SourceKind;
        pointerId: number;
        /** From the pointer's place on the floor to the source's centre. */
        offset: FloorPlace;
        place: FloorPlace | undefined;
      }
    | undefined;

  /** Where the pointer points on the floor's plane, in engine axes. */
  function floorPlaceAt(event: PointerEvent, camera: THREE.Camera): FloorPlace | undefined {
    const box = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(floor, hit)) return undefined;
    // The scene has y up, so the floor's depth is its z.
    return { x: hit.x, y: hit.z };
  }

  function insideRoom({ x, y }: FloorPlace): FloorPlace {
    return {
      x: THREE.MathUtils.clamp(x, 0, room.widthMetres),
      y: THREE.MathUtils.clamp(y, 0, room.depthMetres),
    };
  }

  view.addEventListener(
    "pointerdown",
    (event) => {
      const camera = options.camera();
      if (event.target !== canvas || event.button !== 0 || !camera) return;
      const place = floorPlaceAt(event, camera);
      if (!place) return;
      const kind = SOURCE_KINDS.find((each) => {
        const shown = options.shownPlace(each);
        return shown && Math.hypot(shown.x - place.x, shown.y - place.y) <= PICK_RADIUS_METRES;
      });
      const shown = kind && options.shownPlace(kind);
      if (!kind || !shown) return;
      // Captured before the controls hear of it, so the camera stays where it is.
      event.stopPropagation();
      options.setOrbitEnabled(false);
      canvas.setPointerCapture(event.pointerId);
      const offset = { x: shown.x - place.x, y: shown.y - place.y };
      dragging = { kind, pointerId: event.pointerId, offset, place: undefined };
    },
    { capture: true },
  );

  canvas.addEventListener("pointermove", (event) => {
    const camera = options.camera();
    if (dragging?.pointerId !== event.pointerId || !camera) return;
    const pointer = floorPlaceAt(event, camera);
    if (!pointer) return;
    const { offset } = dragging;
    dragging.place = insideRoom({ x: pointer.x + offset.x, y: pointer.y + offset.y });
    options.onDrag(dragging.kind, dragging.place);
  });

  function drop(event: PointerEvent): void {
    if (dragging?.pointerId !== event.pointerId) return;
    const { kind, place } = dragging;
    dragging = undefined;
    options.setOrbitEnabled(true);
    // A press without a drag leaves the source where it was.
    if (place) options.onDrop(kind, place);
  }
  canvas.addEventListener("pointerup", drop);
  canvas.addEventListener("pointercancel", drop);
}
