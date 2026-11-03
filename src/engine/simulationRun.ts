import { exp } from "./exactMath";
import {
  BEHAVIOURS,
  DRIVERS,
  TRANSITIONS,
  driverContributions,
  turningScale,
  vigilanceStateOf,
  type Behaviour,
  type DriverId,
  type InternalState,
  type Senses,
  type TransitionDefinition,
  type TransitionId,
  type VigilanceState,
} from "./model";
import { DEFAULT_PARAMETERS, type ModelParameters } from "./parameters";
import {
  DEFAULT_STEPS_PER_SECOND,
  adaptToSenses,
  advanceBodyState,
  clockOf,
  initialBodyState,
  internalStateOf,
} from "./physiology";
import {
  DEFAULT_LIGHT_SCHEDULE,
  lightLevel,
  timeOfDayHours,
  validateLightSchedule,
  type LightSchedule,
} from "./lightSchedule";
import {
  SURFACES,
  createMovement,
  type MovementPose,
  type RoomSetup,
  type Surface,
} from "./movement";
import { createRandomStream } from "./random";
import {
  SOURCE_KINDS,
  createRoomContents,
  defaultPlace,
  validateFloorPlace,
  type FloorPlace,
  type SourceKind,
} from "./roomContents";

/** Changes whenever the same seed and setup could give a different run. */
export const MODEL_VERSION = "0.6.0";

const AROUSAL_NOISE_STREAM = 1;
const MOVEMENT_STREAM = 2;
const DEFAULT_TRIGGER_STREAM = 3;
const SLEEP_DEPTH_NOISE_STREAM = 4;

export const DEFAULT_ROOM: RoomSetup = { widthMetres: 1, depthMetres: 1, heightMetres: 0.6 };

/** Something the experimenter does to a run. */
export type InterventionAction =
  | { readonly type: "disturb" }
  | { readonly type: "light-schedule"; readonly lightSchedule: LightSchedule }
  /** Moves a source across the floor. Its field goes with it, and the fly learns of it only by sensing it. */
  | { readonly type: "move-source"; readonly source: SourceKind; readonly place: FloorPlace }
  /** Takes a source away, with its field, until it is restored to where it was. */
  | { readonly type: "remove-source"; readonly source: SourceKind }
  | { readonly type: "restore-source"; readonly source: SourceKind };

export type InterventionType = InterventionAction["type"];

/** An action applied at the start of its step. */
export type Intervention = InterventionAction & { readonly step: number };

/**
 * A study's chamber, such as an activity-monitor tube, which a Virtual Assay runs the fly in
 * instead of the Room. Its size is the setup's room.
 */
export interface Chamber {
  /** What the study calls it, which the Run Record shows. */
  readonly name: string;
  /** Whether the fly can take off at all. When it can't, no take-off is ever available. */
  readonly flightPossible: boolean;
  /**
   * How close to a source's place the fly touches it, from any surface, as it would a food plug
   * filling the chamber's end. Food and water may share a place, as a plug provides both.
   */
  readonly sourceReachMetres: number;
}

export interface SimulationSetup {
  /** The box the fly lives in: the Room, or a study's chamber when one is given. */
  readonly room: RoomSetup;
  /** A study's chamber, for a Virtual Assay. The default is the Room. */
  readonly chamber?: Chamber | null;
  readonly seed: number;
  readonly parameters?: ModelParameters;
  /**
   * Where the food is on the floor, or null for a Room without food. The default is away
   * from the middle of the Room.
   */
  readonly food?: FloorPlace | null;
  /** Where the water is, or null for a Room without water. The default is apart from the food. */
  readonly water?: FloorPlace | null;
  /** The default is 12:12. The run starts at lights-on, and interventions can change it. */
  readonly lightSchedule?: LightSchedule;
  /** Interventions to apply at given steps, on top of any made during the run. */
  readonly interventions?: readonly Intervention[];
  /**
   * Which random stream draws Trigger Levels. Changing it changes when transitions
   * fire and nothing else, which shows what does and doesn't depend on Trigger Levels.
   */
  readonly triggerStream?: number;
  /** Keeps only the latest samples, for long viewer runs. The default keeps them all. */
  readonly maxRecordedSamples?: number;
  /**
   * How many fixed steps the run takes per simulated second, 50 by default. Rates, time constants
   * and noise act per simulated second, so another step size changes the run only by chance.
   */
  readonly stepsPerSecond?: number;
}

export interface TransitionState {
  readonly transition: TransitionId;
  /** Per second. */
  readonly hazard: number;
  /** Add up to the hazard. */
  readonly contributions: Readonly<Record<DriverId, number>>;
  /** The red strip's value, calculated from the current hazard alone. */
  readonly fireProbabilityNextMinute: number;
}

export interface RunSample extends MovementPose, InternalState {
  readonly step: number;
  readonly timeSeconds: number;
  /** The Room's clock, from 0 up to 24. */
  readonly timeOfDayHours: number;
  /** The Room's overhead light, from 0 to 1. The fly gets it only through its senses. */
  readonly lightLevel: number;
  /** The schedule in effect, which interventions may have changed since the run started. */
  readonly lightSchedule: LightSchedule;
  /** What the fly can currently sense. */
  readonly senses: Senses;
  readonly behaviour: Behaviour;
  /** The fly's true state, which a lab can't read directly. */
  readonly vigilanceState: VigilanceState;
  /** How fast the fly is really moving, for anything that needs to show its movement. */
  readonly speedMetresPerSecond: number;
  /** The transitions available from the current behaviour. */
  readonly transitions: readonly TransitionState[];
  /** Where the food is now, or null if there is none. The fly gets it only through its senses. */
  readonly food: FloorPlace | null;
  /** Where the water is now, or null if there is none. */
  readonly water: FloorPlace | null;
  /** How the fly died, or null while it lives. */
  readonly death: Death | null;
}

/** Death ends a run. It comes only when a reserve runs out. */
export interface Death {
  readonly step: number;
  readonly timeSeconds: number;
  readonly cause: "starvation" | "desiccation";
}

export interface FiredTransition extends TransitionState {
  readonly step: number;
  readonly timeSeconds: number;
  readonly from: Behaviour;
  readonly to: Behaviour;
  readonly triggerLevel: number;
  /** The true Vigilance State the transition led to. */
  readonly vigilanceState: VigilanceState;
  readonly sleepPressure: number;
  /** Sleep Depth when the transition fired, or null if the fly was awake. */
  readonly sleepDepth: number | null;
  readonly hunger: number;
  readonly thirst: number;
}

export interface RunRecord {
  readonly modelVersion: string;
  readonly seed: number;
  /** Which random stream drew Trigger Levels. */
  readonly triggerStream: number;
  readonly room: RoomSetup;
  /** The study's chamber the fly lived in, or null for the Room. */
  readonly chamber: Chamber | null;
  readonly parameters: ModelParameters;
  /** Where the food started, or null if there was none. */
  readonly food: FloorPlace | null;
  /** Where the water started, or null if there was none. */
  readonly water: FloorPlace | null;
  /** The schedule the run started with. Later ones are among its interventions. */
  readonly lightSchedule: LightSchedule;
  readonly stepsPerSecond: number;
  /** The step the run has reached. */
  readonly step: number;
  /** One per simulated second, starting at step 0 unless older ones were dropped. */
  readonly samples: readonly RunSample[];
  readonly firedTransitions: readonly FiredTransition[];
  /** Every intervention up to the current step, in step order, wherever it came from. */
  readonly interventions: readonly Intervention[];
  /** Covers the whole run, even when older samples were dropped. */
  readonly timeOnSurfaceSeconds: Readonly<Record<Surface, number>>;
  /** Covers the whole run, even when older samples were dropped. */
  readonly timeInBehaviourSeconds: Readonly<Record<Behaviour, number>>;
  /** How the fly died, or null if it is alive. */
  readonly death: Death | null;
}

/** What a replay needs from a record of a run: its seed, its setup and its Interventions. */
export type RecordedSetup = Pick<
  RunRecord,
  | "seed"
  | "triggerStream"
  | "stepsPerSecond"
  | "room"
  | "chamber"
  | "parameters"
  | "food"
  | "water"
  | "lightSchedule"
  | "interventions"
>;

/**
 * The setup that replays a recorded run from its start, with every Intervention made up front at
 * its original step. Advanced to the same step, the replay gives the same Run Record.
 */
export function replaySetup(recorded: RecordedSetup): SimulationSetup {
  return {
    seed: recorded.seed,
    triggerStream: recorded.triggerStream,
    stepsPerSecond: recorded.stepsPerSecond,
    room: recorded.room,
    chamber: recorded.chamber,
    parameters: recorded.parameters,
    food: recorded.food,
    water: recorded.water,
    lightSchedule: recorded.lightSchedule,
    interventions: recorded.interventions,
  };
}

/** The engine's single public interface. */
export interface SimulationRun {
  advanceSteps(steps: number): void;
  advanceSeconds(seconds: number): void;
  /** The state at the current step. */
  current(): RunSample;
  /** All transitions so far, as a live view that grows as the run advances. */
  readonly firedTransitions: readonly FiredTransition[];
  /** Applies an intervention at the start of the next step, and returns it with that step. */
  intervene(action: InterventionAction): Intervention;
  /** All interventions, as a live view in step order. */
  readonly interventions: readonly Intervention[];
  record(): RunRecord;
}

interface PendingTransition {
  readonly definition: TransitionDefinition;
  readonly triggerLevel: number;
  accumulatedHazard: number;
}

function validateSource(source: SourceKind): void {
  if (!SOURCE_KINDS.includes(source)) throw new Error(`There is no source called ${source}`);
}

/** Checks an Intervention's details too, as one read from a file may be anything. */
function validateAction(action: InterventionAction, room: RoomSetup): void {
  switch (action.type) {
    case "disturb":
      return;
    case "light-schedule":
      validateLightSchedule(action.lightSchedule);
      return;
    case "move-source":
      validateSource(action.source);
      validateFloorPlace(room, action.place);
      return;
    case "remove-source":
    case "restore-source":
      validateSource(action.source);
      return;
    default:
      throw new Error(
        `There is no Intervention of type ${String((action as { type: unknown }).type)}`,
      );
  }
}

export function createSimulationRun(setup: SimulationSetup): SimulationRun {
  const { room, seed, maxRecordedSamples = Infinity } = setup;
  const clock = clockOf(setup.stepsPerSecond ?? DEFAULT_STEPS_PER_SECOND);
  const { stepsPerSecond, stepSeconds } = clock;
  const parameters = setup.parameters ?? DEFAULT_PARAMETERS;
  const initialPlaces = {
    food: setup.food === undefined ? defaultPlace("food", room) : setup.food,
    water: setup.water === undefined ? defaultPlace("water", room) : setup.water,
  };
  const chamber = setup.chamber ?? null;
  if (chamber && !(chamber.sourceReachMetres > 0)) {
    throw new Error(`A chamber's sources must reach some way, not ${chamber.sourceReachMetres} m`);
  }
  const contents = createRoomContents(
    room,
    initialPlaces,
    parameters,
    chamber?.sourceReachMetres ?? null,
  );
  /** The transitions this setup allows at all. A chamber may make flight impossible. */
  const possibleTransitions = TRANSITIONS.filter(
    (definition) => definition.to !== "flying" || (chamber?.flightPossible ?? true),
  );
  const initialLightSchedule = setup.lightSchedule ?? DEFAULT_LIGHT_SCHEDULE;
  validateLightSchedule(initialLightSchedule);
  let lightSchedule = initialLightSchedule;
  const bodyNoise = {
    arousal: createRandomStream(seed, AROUSAL_NOISE_STREAM),
    sleepDepth: createRandomStream(seed, SLEEP_DEPTH_NOISE_STREAM),
  };
  const movementNoise = createRandomStream(seed, MOVEMENT_STREAM);
  const triggerStream = setup.triggerStream ?? DEFAULT_TRIGGER_STREAM;
  const triggerLevelStream = createRandomStream(seed, triggerStream);

  const samples: RunSample[] = [];
  const firedTransitions: FiredTransition[] = [];
  for (const intervention of setup.interventions ?? []) {
    const { step: at } = intervention;
    if (!Number.isInteger(at) || at < 0) throw new Error(`No intervention can be at step ${at}`);
    validateAction(intervention, room);
  }
  const interventions = [...(setup.interventions ?? [])].sort((a, b) => a.step - b.step);
  let nextIntervention = 0;

  let step = 0;
  let behaviour: Behaviour = "immobility";
  let death: Death | null = null;
  const movement = createMovement(room, movementNoise);
  const stepsOnSurface = new Map<Surface, number>();
  const stepsInBehaviour = new Map<Behaviour, number>();
  let pending = drawTriggerLevels();

  function drawTriggerLevels(): PendingTransition[] {
    return possibleTransitions
      .filter((definition) => definition.from === behaviour)
      .map((definition) => ({
        definition,
        triggerLevel: triggerLevelStream.exponential(),
        accumulatedHazard: 0,
      }));
  }

  function currentTimeOfDay(): number {
    return timeOfDayHours(initialLightSchedule.lightsOnHour, step * stepSeconds);
  }

  function currentLightLevel(): number {
    return lightLevel(lightSchedule, currentTimeOfDay());
  }

  /**
   * What the fly senses, the only route from the world to its hazards. It is worked out once
   * between changes to the world or to where the fly is, as every hazard needs it each step.
   */
  let sensed: Senses | undefined;

  function currentSenses(): Senses {
    sensed ??= sense();
    return sensed;
  }

  function sense(): Senses {
    const { position, surface } = movement.pose();
    return {
      touchingSurface: movement.hasArrived(),
      lightLevel: currentLightLevel(),
      touchingFood: contents.touching("food", position, surface),
      touchingWater: contents.touching("water", position, surface),
      odour: contents.odourAt(position),
      humidity: contents.humidityAt(position),
    };
  }

  let body = initialBodyState(parameters, currentSenses());

  function internalState(): InternalState {
    return internalStateOf(body);
  }

  /** A transition's hazard and what makes it up, given the fly's state this step. */
  function hazardOf(transition: TransitionId, state: InternalState) {
    const contributions = driverContributions(transition, state, currentSenses(), parameters);
    let hazard = 0;
    for (const driver of DRIVERS) hazard += contributions[driver];
    return { transition, hazard, contributions };
  }

  function withStrip(parts: ReturnType<typeof hazardOf>): TransitionState {
    return { ...parts, fireProbabilityNextMinute: 1 - exp(-parts.hazard * 60) };
  }

  function transitionState(transition: TransitionId): TransitionState {
    return withStrip(hazardOf(transition, internalState()));
  }

  function fireDueTransition(): void {
    // The state can't change until a transition fires, so it is worked out once.
    const state = internalState();
    for (const item of pending) {
      const parts = hazardOf(item.definition.id, state);
      item.accumulatedHazard += parts.hazard * stepSeconds;
      if (item.accumulatedHazard >= item.triggerLevel) {
        firedTransitions.push({
          ...withStrip(parts),
          step: step + 1,
          timeSeconds: (step + 1) * stepSeconds,
          from: item.definition.from,
          to: item.definition.to,
          triggerLevel: item.triggerLevel,
          vigilanceState: vigilanceStateOf(item.definition.to),
          sleepPressure: state.sleepPressure,
          sleepDepth: state.sleepDepth,
          hunger: state.hunger,
          thirst: state.thirst,
        });
        behaviour = item.definition.to;
        body = {
          ...body,
          sleepDepth: behaviour === "sleeping" ? parameters.sleepDepthAtOnset : null,
        };
        if (item.definition.to === "flying") movement.takeOff();
        if (item.definition.from === "flying") movement.land();
        sensed = undefined;
        pending = drawTriggerLevels();
        return;
      }
    }
  }

  function currentSpeed(): number {
    switch (behaviour) {
      case "immobility":
      case "grooming":
      case "sleeping":
      case "feeding":
      case "drinking":
        return 0;
      case "walking":
        return parameters.walkingSpeedMetresPerSecond;
      case "flying":
        return movement.hasArrived() ? 0 : parameters.flightSpeedMetresPerSecond;
    }
  }

  function applyDueInterventions(): void {
    for (
      let due = interventions[nextIntervention];
      due?.step === step;
      due = interventions[++nextIntervention]
    ) {
      switch (due.type) {
        case "disturb":
          body = { ...body, startle: 1 };
          break;
        case "light-schedule":
          lightSchedule = due.lightSchedule;
          break;
        case "move-source":
          contents.move(due.source, due.place);
          break;
        case "remove-source":
          contents.remove(due.source);
          break;
        case "restore-source":
          contents.restore(due.source);
          break;
      }
    }
  }

  /** Steers by comparing what the fly senses now with what it has sensed lately. */
  function walk(senses: Senses): void {
    movement.walk(
      parameters.walkingSpeedMetresPerSecond * stepSeconds,
      turningScale(internalState(), senses, parameters) *
        parameters.walkingTurnNoise *
        clock.sqrtStepSeconds *
        movementNoise.normal(),
    );
  }

  function current(): RunSample {
    return {
      step,
      timeSeconds: step * stepSeconds,
      timeOfDayHours: currentTimeOfDay(),
      lightLevel: currentLightLevel(),
      lightSchedule,
      senses: currentSenses(),
      behaviour,
      vigilanceState: vigilanceStateOf(behaviour),
      ...movement.pose(),
      speedMetresPerSecond: death ? 0 : currentSpeed(),
      ...internalState(),
      transitions: death ? [] : pending.map((item) => transitionState(item.definition.id)),
      food: contents.place("food"),
      water: contents.place("water"),
      death,
    };
  }

  /** A reserve that has run out kills the fly where it is, and it drops to the floor. */
  function checkForDeath(): boolean {
    const cause = body.energy <= 0 ? "starvation" : body.hydration <= 0 ? "desiccation" : undefined;
    if (!cause) return false;
    death = { step, timeSeconds: step * stepSeconds, cause };
    behaviour = "immobility";
    body = { ...body, sleepDepth: null };
    movement.fall();
    sensed = undefined;
    return true;
  }

  function recordSample(): void {
    samples.push(current());
    // Drops in blocks, as removing one sample from the front on every step is slow.
    if (samples.length >= 2 * maxRecordedSamples) samples.splice(0, maxRecordedSamples);
  }

  function advanceSteps(steps: number): void {
    for (let i = 0; i < steps && !death; i++) {
      applyDueInterventions();
      sensed = undefined;
      fireDueTransition();
      const senses = currentSenses();
      body = advanceBodyState(body, behaviour, senses, parameters, bodyNoise, clock);
      if (behaviour === "walking") walk(senses);
      body = adaptToSenses(body, senses, parameters, clock);
      if (behaviour === "flying") movement.fly(parameters.flightSpeedMetresPerSecond * stepSeconds);
      const surface = movement.surface();
      if (surface) stepsOnSurface.set(surface, (stepsOnSurface.get(surface) ?? 0) + 1);
      stepsInBehaviour.set(behaviour, (stepsInBehaviour.get(behaviour) ?? 0) + 1);
      step += 1;
      // The fly may have moved, and the time of day has moved on.
      sensed = undefined;
      const died = checkForDeath();
      // The record always ends with the moment of death.
      if (step % stepsPerSecond === 0 || died) recordSample();
    }
  }

  recordSample();

  return {
    advanceSteps,
    advanceSeconds: (seconds) => {
      advanceSteps(Math.round(seconds * stepsPerSecond));
    },
    current,
    firedTransitions,
    intervene: (action) => {
      if (death) throw new Error("The fly has died, so the run can't change");
      validateAction(action, room);
      const intervention: Intervention = { ...action, step };
      // Later than any at this step or before, which keeps the list in step order.
      const after = interventions.findIndex((each) => each.step > step);
      interventions.splice(after === -1 ? interventions.length : after, 0, intervention);
      return intervention;
    },
    interventions,
    record: () => ({
      modelVersion: MODEL_VERSION,
      seed,
      triggerStream,
      room,
      chamber,
      parameters,
      food: initialPlaces.food,
      water: initialPlaces.water,
      lightSchedule: initialLightSchedule,
      stepsPerSecond,
      step,
      samples: [...samples],
      firedTransitions: [...firedTransitions],
      // One due later isn't in the record yet, as it wouldn't be if made during the run.
      interventions: interventions.filter((each) => each.step <= step),
      timeOnSurfaceSeconds: Object.fromEntries(
        SURFACES.map((surface) => [surface, (stepsOnSurface.get(surface) ?? 0) * stepSeconds]),
      ) as Record<Surface, number>,
      timeInBehaviourSeconds: Object.fromEntries(
        BEHAVIOURS.map((each) => [each, (stepsInBehaviour.get(each) ?? 0) * stepSeconds]),
      ) as Record<Behaviour, number>,
      death,
    }),
  };
}
