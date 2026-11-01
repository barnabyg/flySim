import {
  BEHAVIOURS,
  DEFAULT_PARAMETERS,
  DRIVERS,
  TRANSITIONS,
  driverContributions,
  vigilanceStateOf,
  type Behaviour,
  type DriverId,
  type ModelParameters,
  type Senses,
  type TransitionDefinition,
  type TransitionId,
  type VigilanceState,
} from "./model";
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

export const MODEL_VERSION = "0.3.0";

/** The simulation always advances in fixed steps of this rate. */
export const STEPS_PER_SECOND = 50;

const STEP_SECONDS = 1 / STEPS_PER_SECOND;
const SQRT_STEP_SECONDS = Math.sqrt(STEP_SECONDS);
const STEP_HOURS = STEP_SECONDS / 3600;

const MIN_STARTLE = 1e-6;

const DRIVER_NOISE_STREAM = 1;
const MOVEMENT_STREAM = 2;
const DEFAULT_TRIGGER_STREAM = 3;
const SLEEP_DEPTH_NOISE_STREAM = 4;

export const DEFAULT_ROOM: RoomSetup = { widthMetres: 1, depthMetres: 1, heightMetres: 0.6 };

export type InterventionType = "disturb";

/** Something the experimenter does to a run, applied at the start of its step. */
export interface Intervention {
  readonly step: number;
  readonly type: InterventionType;
}

export interface SimulationSetup {
  readonly room: RoomSetup;
  readonly seed: number;
  readonly parameters?: ModelParameters;
  /** The default is 12:12. The run starts at lights-on and the schedule stays fixed. */
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

export interface RunSample extends MovementPose {
  readonly step: number;
  readonly timeSeconds: number;
  /** The Room's clock, from 0 up to 24. */
  readonly timeOfDayHours: number;
  /** The Room's overhead light, from 0 to 1. The fly gets it only through its senses. */
  readonly lightLevel: number;
  /** What the fly can currently sense. */
  readonly senses: Senses;
  readonly behaviour: Behaviour;
  /** The fly's true state, which a lab can't read directly. */
  readonly vigilanceState: VigilanceState;
  /** How fast the fly is really moving, for anything that needs to show its movement. */
  readonly speedMetresPerSecond: number;
  readonly arousal: number;
  /** A slow state variable, not a rest timer. It rises while awake and falls while asleep. */
  readonly sleepPressure: number;
  /** How deeply the fly is asleep, from 0 to 1, or null while it is awake. */
  readonly sleepDepth: number | null;
  /**
   * The internal clock's reading, from 0 up to 24, with 0 at its subjective lights-on.
   * It runs on its own, whatever the Room's light.
   */
  readonly circadianPhaseHours: number;
  /** What's left of the latest disturbance, from 1 when it happens down to 0. */
  readonly startle: number;
  /** The transitions available from the current behaviour. */
  readonly transitions: readonly TransitionState[];
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
}

export interface RunRecord {
  readonly modelVersion: string;
  readonly seed: number;
  readonly room: RoomSetup;
  readonly parameters: ModelParameters;
  readonly lightSchedule: LightSchedule;
  readonly stepsPerSecond: number;
  /** One per simulated second, starting at step 0 unless older ones were dropped. */
  readonly samples: readonly RunSample[];
  readonly firedTransitions: readonly FiredTransition[];
  /** Every intervention, in step order. */
  readonly interventions: readonly Intervention[];
  /** Covers the whole run, even when older samples were dropped. */
  readonly timeOnSurfaceSeconds: Readonly<Record<Surface, number>>;
  /** Covers the whole run, even when older samples were dropped. */
  readonly timeInBehaviourSeconds: Readonly<Record<Behaviour, number>>;
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
  intervene(type: InterventionType): Intervention;
  /** All interventions, as a live view in step order. */
  readonly interventions: readonly Intervention[];
  record(): RunRecord;
}

interface PendingTransition {
  readonly definition: TransitionDefinition;
  readonly triggerLevel: number;
  accumulatedHazard: number;
}

export function createSimulationRun(setup: SimulationSetup): SimulationRun {
  const { room, seed, maxRecordedSamples = Infinity } = setup;
  const parameters = setup.parameters ?? DEFAULT_PARAMETERS;
  const lightSchedule = setup.lightSchedule ?? DEFAULT_LIGHT_SCHEDULE;
  validateLightSchedule(lightSchedule);
  const driverNoise = createRandomStream(seed, DRIVER_NOISE_STREAM);
  const movementNoise = createRandomStream(seed, MOVEMENT_STREAM);
  const sleepDepthNoise = createRandomStream(seed, SLEEP_DEPTH_NOISE_STREAM);
  const triggerLevelStream = createRandomStream(
    seed,
    setup.triggerStream ?? DEFAULT_TRIGGER_STREAM,
  );

  const samples: RunSample[] = [];
  const firedTransitions: FiredTransition[] = [];
  for (const { step: at } of setup.interventions ?? []) {
    if (!Number.isInteger(at) || at < 0) throw new Error(`No intervention can be at step ${at}`);
  }
  const interventions = [...(setup.interventions ?? [])].sort((a, b) => a.step - b.step);
  let nextIntervention = 0;

  let step = 0;
  let behaviour: Behaviour = "immobility";
  let arousal = parameters.initialArousal;
  let sleepPressure = parameters.initialSleepPressure;
  let sleepDepth: number | null = null;
  let circadianPhaseHours = 0;
  let startle = 0;
  const movement = createMovement(room, movementNoise);
  const stepsOnSurface = new Map<Surface, number>();
  const stepsInBehaviour = new Map<Behaviour, number>();
  let pending = drawTriggerLevels();

  function drawTriggerLevels(): PendingTransition[] {
    return TRANSITIONS.filter((definition) => definition.from === behaviour).map((definition) => ({
      definition,
      triggerLevel: triggerLevelStream.exponential(),
      accumulatedHazard: 0,
    }));
  }

  /** The only route from the world to the fly's hazards. */
  function currentSenses(): Senses {
    return {
      touchingSurface: movement.hasArrived(),
      lightLevel: lightLevel(lightSchedule, step * STEP_SECONDS),
    };
  }

  function transitionState(transition: TransitionId): TransitionState {
    const contributions = driverContributions(
      transition,
      { arousal, sleepPressure, sleepDepth, circadianPhaseHours, startle },
      currentSenses(),
      parameters,
    );
    const hazard = DRIVERS.reduce((sum, driver) => sum + contributions[driver], 0);
    return {
      transition,
      hazard,
      contributions,
      fireProbabilityNextMinute: 1 - Math.exp(-hazard * 60),
    };
  }

  function fireDueTransition(): void {
    for (const item of pending) {
      const state = transitionState(item.definition.id);
      item.accumulatedHazard += state.hazard * STEP_SECONDS;
      if (item.accumulatedHazard >= item.triggerLevel) {
        firedTransitions.push({
          ...state,
          step: step + 1,
          timeSeconds: (step + 1) * STEP_SECONDS,
          from: item.definition.from,
          to: item.definition.to,
          triggerLevel: item.triggerLevel,
          vigilanceState: vigilanceStateOf(item.definition.to),
          sleepPressure,
          sleepDepth,
        });
        behaviour = item.definition.to;
        sleepDepth = behaviour === "sleeping" ? parameters.sleepDepthAtOnset : null;
        if (item.definition.to === "flying") movement.takeOff();
        if (item.definition.from === "flying") movement.land();
        pending = drawTriggerLevels();
        return;
      }
    }
  }

  function arousalTarget(): number {
    switch (behaviour) {
      case "immobility":
        return parameters.arousalTargetImmobile;
      case "grooming":
        return parameters.arousalTargetGrooming;
      case "walking":
        return parameters.arousalTargetWalking;
      case "flying":
        return parameters.arousalTargetFlying;
      case "sleeping":
        return parameters.arousalTargetSleeping;
    }
  }

  function currentSpeed(): number {
    switch (behaviour) {
      case "immobility":
      case "grooming":
      case "sleeping":
        return 0;
      case "walking":
        return parameters.walkingSpeedMetresPerSecond;
      case "flying":
        return movement.hasArrived() ? 0 : parameters.flightSpeedMetresPerSecond;
    }
  }

  function updateArousal(): void {
    const target = arousalTarget();
    const next =
      arousal +
      ((target - arousal) / parameters.arousalTimeConstantSeconds) * STEP_SECONDS +
      parameters.arousalNoise * SQRT_STEP_SECONDS * driverNoise.normal();
    arousal = Math.min(1, Math.abs(next));
  }

  function updateSleepPressure(): void {
    sleepPressure +=
      vigilanceStateOf(behaviour) === "asleep"
        ? (-sleepPressure / parameters.sleepPressureFallTimeConstantSeconds) * STEP_SECONDS
        : ((1 - sleepPressure) / parameters.sleepPressureRiseTimeConstantSeconds) * STEP_SECONDS;
  }

  /** Follows sleep pressure and its own noise. Nothing here knows how long the bout has lasted. */
  function updateSleepDepth(): void {
    if (sleepDepth === null) return;
    const target =
      parameters.sleepDepthBaseTarget + parameters.sleepDepthSleepPressureGain * sleepPressure;
    const next =
      sleepDepth +
      ((target - sleepDepth) / parameters.sleepDepthTimeConstantSeconds) * STEP_SECONDS +
      parameters.sleepDepthNoise * SQRT_STEP_SECONDS * sleepDepthNoise.normal();
    sleepDepth = Math.min(1, Math.abs(next));
  }

  function updateCircadianClock(): void {
    const clockHoursPerHour = 24 / parameters.circadianPeriodHours;
    circadianPhaseHours = (circadianPhaseHours + clockHoursPerHour * STEP_HOURS) % 24;
  }

  function applyDueInterventions(): void {
    for (
      let due = interventions[nextIntervention];
      due?.step === step;
      due = interventions[++nextIntervention]
    ) {
      startle = 1;
    }
  }

  function updateStartle(): void {
    startle *= Math.exp(-STEP_SECONDS / parameters.startleTimeConstantSeconds);
    // Ends a faded startle outright, so that it leaves no trace in later hazards.
    if (startle < MIN_STARTLE) startle = 0;
  }

  function walk(): void {
    movement.walk(
      parameters.walkingSpeedMetresPerSecond * STEP_SECONDS,
      parameters.walkingTurnNoise * SQRT_STEP_SECONDS * movementNoise.normal(),
    );
  }

  function current(): RunSample {
    return {
      step,
      timeSeconds: step * STEP_SECONDS,
      timeOfDayHours: timeOfDayHours(lightSchedule, step * STEP_SECONDS),
      lightLevel: lightLevel(lightSchedule, step * STEP_SECONDS),
      senses: currentSenses(),
      behaviour,
      vigilanceState: vigilanceStateOf(behaviour),
      ...movement.pose(),
      speedMetresPerSecond: currentSpeed(),
      arousal,
      sleepPressure,
      sleepDepth,
      circadianPhaseHours,
      startle,
      transitions: pending.map((item) => transitionState(item.definition.id)),
    };
  }

  function recordSample(): void {
    samples.push(current());
    // Drops in blocks, as removing one sample from the front on every step is slow.
    if (samples.length >= 2 * maxRecordedSamples) samples.splice(0, maxRecordedSamples);
  }

  function advanceSteps(steps: number): void {
    for (let i = 0; i < steps; i++) {
      applyDueInterventions();
      fireDueTransition();
      updateArousal();
      updateSleepPressure();
      updateSleepDepth();
      updateCircadianClock();
      updateStartle();
      if (behaviour === "walking") walk();
      if (behaviour === "flying")
        movement.fly(parameters.flightSpeedMetresPerSecond * STEP_SECONDS);
      const surface = movement.surface();
      if (surface) stepsOnSurface.set(surface, (stepsOnSurface.get(surface) ?? 0) + 1);
      stepsInBehaviour.set(behaviour, (stepsInBehaviour.get(behaviour) ?? 0) + 1);
      step += 1;
      if (step % STEPS_PER_SECOND === 0) recordSample();
    }
  }

  recordSample();

  return {
    advanceSteps,
    advanceSeconds: (seconds) => {
      advanceSteps(Math.round(seconds * STEPS_PER_SECOND));
    },
    current,
    firedTransitions,
    intervene: (type) => {
      const intervention = { step, type };
      // Later than any at this step or before, which keeps the list in step order.
      const after = interventions.findIndex((each) => each.step > step);
      interventions.splice(after === -1 ? interventions.length : after, 0, intervention);
      return intervention;
    },
    interventions,
    record: () => ({
      modelVersion: MODEL_VERSION,
      seed,
      room,
      parameters,
      lightSchedule,
      stepsPerSecond: STEPS_PER_SECOND,
      samples: [...samples],
      firedTransitions: [...firedTransitions],
      interventions: [...interventions],
      timeOnSurfaceSeconds: Object.fromEntries(
        SURFACES.map((surface) => [surface, (stepsOnSurface.get(surface) ?? 0) * STEP_SECONDS]),
      ) as Record<Surface, number>,
      timeInBehaviourSeconds: Object.fromEntries(
        BEHAVIOURS.map((each) => [each, (stepsInBehaviour.get(each) ?? 0) * STEP_SECONDS]),
      ) as Record<Behaviour, number>,
    }),
  };
}
