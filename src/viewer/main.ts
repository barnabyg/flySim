import * as THREE from "three";
import {
  DEFAULT_LIGHT_SCHEDULE,
  DEFAULT_PARAMETERS,
  DEFAULT_STEPS_PER_SECOND,
  MODEL_VERSION,
  SOURCE_KINDS,
  lightLevel,
  readRunExport,
  replaySetup,
  type FloorPlace,
  type LightSchedule,
  type RunRecord,
  type RunSample,
  type SourceKind,
} from "../engine";
import { download } from "./download";
import { readMaybeGzipped } from "./gzip";
import { createDriverPanel, type FlashedTransition } from "./driverPanel";
import { createFieldOverlay } from "./fieldOverlay";
import { createRibbon } from "./ribbon";
import { createRoomScene } from "./roomScene";
import { createRunControls } from "./runControls";
import { startReplay, takeReplay } from "./replay";
import {
  randomSeed,
  settingsForSetup,
  settingsFromUrl,
  setupForSettings,
  urlForSettings,
  type RunSettings,
} from "./runSettings";
import { startSimulation } from "./simulationClient";
import { createSourceDragging } from "./sourceDragging";
import { INITIAL_SPEED, SPEEDS, createTimeControls } from "./timeControls";
import { createViews, type ViewState } from "./views";

/** Lets browser tests and the console observe a run. It can't change one. */
export interface FlySimApi {
  readonly seed: number;
  current(): RunSample | undefined;
  record(): Promise<RunRecord>;
  flyScenePosition(): { x: number; y: number; z: number };
  flashes(): readonly FlashedTransition[];
  view(): ViewState;
  /** Whether the field overlay is showing. */
  fields(): { visible: boolean };
  /** Where each source is shown, and its centre in the page, or null if it isn't showing. */
  sources(): Record<SourceKind, { place: FloorPlace; client: { x: number; y: number } } | null>;
}

declare global {
  interface Window {
    flySim: FlySimApi;
  }
}

function requireElement<T extends Element>(selector: string, type: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing element: ${selector}`);
  return element;
}

const settings = settingsFromUrl(location.search, SPEEDS, INITIAL_SPEED);
let speed = settings.speed;
/** A replay's setup, which carries its Interventions, or else the run the URL sets up. */
const setup = takeReplay(location.search) ?? setupForSettings(settings);
const { room, seed } = setup;
const lightSchedule = setup.lightSchedule ?? DEFAULT_LIGHT_SCHEDULE;

function restartWith(changes: Partial<RunSettings>): void {
  location.assign(urlForSettings({ ...settings, speed, ...changes }));
}

/** Tells the experimenter why something they asked for didn't happen. */
function report(error: unknown): void {
  alert(error instanceof Error ? error.message : String(error));
}

async function replay(): Promise<void> {
  try {
    startReplay(await simulation.replaySetup(), urlForSettings({ ...settings, speed }));
  } catch (error) {
    report(error);
  }
}

/**
 * Replays an exported run from its start, as Replay does the current one, with the URL changed to
 * match it where it can. It says why it won't replay a file, and asks first if another model
 * version made it.
 */
async function openRun(file: File): Promise<void> {
  let reading;
  try {
    // A file that can't be read as text is no export, which reading it as empty says.
    reading = readRunExport(await readMaybeGzipped(file).catch(() => ""));
  } catch (error) {
    report(error);
    return;
  }
  const { run, sameModelVersion } = reading;
  if (run.chamber) {
    // Chambers are for Virtual Assays, which run without the viewer.
    report(new Error(`This run is in a study's chamber, the ${run.chamber.name}, not the Room.`));
    return;
  }
  if (
    !sameModelVersion &&
    !confirm(
      `This run was made by model version ${run.modelVersion}, and this simulator's model is version ${MODEL_VERSION}, so the replay might not be the same run. Replay it anyway?`,
    )
  ) {
    return;
  }
  const opened = replaySetup(run);
  try {
    startReplay(opened, urlForSettings(settingsForSetup(opened, speed)));
  } catch (error) {
    report(error);
  }
}

const view = requireElement("#view", HTMLElement);
const canvas = requireElement("#scene", HTMLCanvasElement);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// Lets the field overlay stop at the Room's walls.
renderer.localClippingEnabled = true;

const roomScene = createRoomScene(room);
const fieldOverlay = createFieldOverlay(room, setup.parameters ?? DEFAULT_PARAMETERS);
roomScene.scene.add(fieldOverlay.object);
const simulation = startSimulation(setup, speed);

const driverPanel = createDriverPanel(requireElement("#drivers", HTMLElement));
const ribbon = createRibbon(
  requireElement("#ribbon", HTMLCanvasElement),
  setup.stepsPerSecond ?? DEFAULT_STEPS_PER_SECOND,
);
ribbon.setSpeed(speed);
const timeControls = createTimeControls(
  requireElement("#controls", HTMLElement),
  speed,
  lightSchedule,
  {
    onSpeedChange: (newSpeed) => {
      speed = newSpeed;
      simulation.setSpeed(newSpeed);
      ribbon.setSpeed(newSpeed);
    },
    onPausedChange: (paused) => {
      simulation.setPaused(paused);
    },
  },
);
const runControls = createRunControls(
  requireElement("#run-controls", HTMLElement),
  seed,
  room,
  lightSchedule,
  {
    onDisturb: () => {
      simulation.intervene({ type: "disturb" });
    },
    onLightScheduleChange: (newSchedule) => {
      simulation.intervene({ type: "light-schedule", lightSchedule: newSchedule });
    },
    onRestart: () => {
      restartWith({});
    },
    onReplay: () => {
      void replay();
    },
    onNewSeed: () => {
      restartWith({ seed: randomSeed() });
    },
    onRoomChange: (newRoom) => {
      restartWith({ room: newRoom });
    },
    onFieldsToggle: (visible) => {
      fieldOverlay.setVisible(visible);
    },
    onExport: (format, sampleIntervalSeconds) => {
      simulation.exportRun(format, sampleIntervalSeconds).then((files) => {
        for (const file of files) download(file.name, file.data);
      }, report);
    },
    onOpen: (file) => {
      void openRun(file);
    },
    onSourcePresenceChange: (kind, present) => {
      changing.set(kind, present ? (lastPlaces.get(kind) ?? null) : null);
      simulation.intervene({ type: present ? "restore-source" : "remove-source", source: kind });
    },
  },
);
const deathNotice = requireElement("#death", HTMLElement);
/**
 * The latest schedule asked for. A change applies to the fly at the next step, which is
 * only once time resumes, but the Room and dial show it at once.
 */
let shownSchedule: LightSchedule = lightSchedule;
simulation.onFrame((sample, fired, interventions) => {
  for (const intervention of interventions) {
    if (intervention.type === "light-schedule") shownSchedule = intervention.lightSchedule;
    // A replay's removals and restorals show on the buttons as they would if made live.
    if (intervention.type === "remove-source" || intervention.type === "restore-source") {
      runControls.showSourcePresent(intervention.source, intervention.type === "restore-source");
    }
  }
  // A change shows from the moment it's made, and stops needing to once the run has it.
  for (const [kind, place] of changing) {
    if (!dragging.has(kind) && samePlace(sample[kind], place)) changing.delete(kind);
  }
  if (sample.death && deathNotice.hidden) {
    deathNotice.hidden = false;
    deathNotice.textContent = `The fly has died of ${CAUSES[sample.death.cause]}.`;
    // The run won't change any more, so nothing the Room shows should either.
    runControls.disableChanges();
  }
  driverPanel.update(sample, fired);
  ribbon.update(sample, fired, interventions);
  timeControls.showTime(sample.timeSeconds, sample.timeOfDayHours, shownSchedule);
});

const views = createViews({
  renderer,
  scene: roomScene.scene,
  model: roomScene.fly,
  room,
  view,
  inset: requireElement("#inset", HTMLElement),
});

/**
 * Sources being dragged, or moved, removed or put back and not yet changed in the run, which
 * show where they are going, or null if they are going away. A source changes in the run at
 * the next step, which is only once time resumes, but the Room shows it at once, as it does a
 * new light schedule.
 */
const changing = new Map<SourceKind, FloorPlace | null>();
const dragging = new Set<SourceKind>();
/** Where each source was last shown, which is where it goes when it is put back. */
const lastPlaces = new Map<SourceKind, FloorPlace>();

function samePlace(a: FloorPlace | null, b: FloorPlace | null): boolean {
  return a === null || b === null ? a === b : a.x === b.x && a.y === b.y;
}

function shownPlace(kind: SourceKind): FloorPlace | null {
  const place = changing.has(kind)
    ? (changing.get(kind) ?? null)
    : (simulation.latest()?.[kind] ?? null);
  if (place) lastPlaces.set(kind, place);
  return place;
}

const CAUSES = { starvation: "starvation", desiccation: "lack of water" } as const;

createSourceDragging({
  view,
  canvas,
  room,
  camera: () => (simulation.latest()?.death ? undefined : views.mainMonitoringCamera()),
  shownPlace,
  setOrbitEnabled: (enabled) => {
    views.setOrbitEnabled(enabled);
  },
  onDrag: (kind, place) => {
    dragging.add(kind);
    changing.set(kind, place);
  },
  onDrop: (kind, place) => {
    dragging.delete(kind);
    changing.set(kind, place);
    simulation.intervene({ type: "move-source", source: kind, place });
  },
});

renderer.setAnimationLoop(() => {
  const sample = simulation.latest();
  if (sample) {
    roomScene.updateFly(sample);
    for (const kind of SOURCE_KINDS) {
      roomScene.placeSource(kind, shownPlace(kind));
      fieldOverlay.placeSource(kind, shownPlace(kind));
    }
    roomScene.updateLighting(lightLevel(shownSchedule, sample.timeOfDayHours));
  }
  views.render();
  ribbon.draw();
});

window.flySim = {
  seed,
  current: () => simulation.latest(),
  record: () => simulation.record(),
  flyScenePosition: () => {
    const { x, y, z } = roomScene.fly.object.position;
    return { x, y, z };
  },
  flashes: () => driverPanel.flashes,
  view: () => views.state(),
  fields: () => ({ visible: fieldOverlay.visible() }),
  sources: () => {
    const camera = views.mainMonitoringCamera();
    const box = canvas.getBoundingClientRect();
    const onScreen = (kind: SourceKind) => {
      const place = shownPlace(kind);
      if (!place || !camera) return null;
      const projected = new THREE.Vector3(place.x, 0, place.y).project(camera);
      return {
        place,
        client: {
          x: box.left + ((projected.x + 1) / 2) * box.width,
          y: box.top + ((1 - projected.y) / 2) * box.height,
        },
      };
    };
    return { food: onScreen("food"), water: onScreen("water") };
  },
};
