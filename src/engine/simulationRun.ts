import {
  BEHAVIOURS,
  DEFAULT_PARAMETERS,
  DRIVERS,
  TRANSITIONS,
  driverContributions,
  type Behaviour,
  type DriverId,
  type ModelParameters,
  type TransitionDefinition,
  type TransitionId,
} from "./model";
import { SURFACES, createMovement, type Position, type RoomSetup, type Surface } from "./movement";
import { createRandomStream } from "./random";

export const MODEL_VERSION = "0.2.0";

/** The simulation always advances in fixed steps of this rate. */
export const STEPS_PER_SECOND = 50;

const STEP_SECONDS = 1 / STEPS_PER_SECOND;
const SQRT_STEP_SECONDS = Math.sqrt(STEP_SECONDS);

const DRIVER_NOISE_STREAM = 1;
const MOVEMENT_STREAM = 2;
const DEFAULT_TRIGGER_STREAM = 3;

export const DEFAULT_ROOM: RoomSetup = { widthMetres: 1, depthMetres: 1, heightMetres: 0.6 };

export interface SimulationSetup {
  readonly room: RoomSetup;
  readonly seed: number;
  readonly parameters?: ModelParameters;
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

export interface RunSample {
  readonly step: number;
  readonly timeSeconds: number;
  readonly behaviour: Behaviour;
  /** Where its feet meet the surface it is on, or are in the air in flight. */
  readonly position: Position;
  /** The surface it stands on, or null from take-off until it lands. */
  readonly surface: Surface | null;
  /** The way the fly faces, a unit vector along its surface, or level in flight. */
  readonly forward: Position;
  /** From its feet towards its back, a unit vector out of its surface, or straight up in flight. */
  readonly up: Position;
  /** How fast the fly is really moving, for anything that needs to show its movement. */
  readonly speedMetresPerSecond: number;
  readonly arousal: number;
  /** The transitions available from the current behaviour. */
  readonly transitions: readonly TransitionState[];
}

export interface FiredTransition extends TransitionState {
  readonly step: number;
  readonly timeSeconds: number;
  readonly from: Behaviour;
  readonly to: Behaviour;
  readonly triggerLevel: number;
}

export interface RunRecord {
  readonly modelVersion: string;
  readonly seed: number;
  readonly room: RoomSetup;
  readonly parameters: ModelParameters;
  readonly stepsPerSecond: number;
  /** One per simulated second, starting at step 0 unless older ones were dropped. */
  readonly samples: readonly RunSample[];
  readonly firedTransitions: readonly FiredTransition[];
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
  const driverNoise = createRandomStream(seed, DRIVER_NOISE_STREAM);
  const movementNoise = createRandomStream(seed, MOVEMENT_STREAM);
  const triggerLevelStream = createRandomStream(
    seed,
    setup.triggerStream ?? DEFAULT_TRIGGER_STREAM,
  );

  const samples: RunSample[] = [];
  const firedTransitions: FiredTransition[] = [];

  let step = 0;
  let behaviour: Behaviour = "immobility";
  let arousal = parameters.initialArousal;
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

  function transitionState(transition: TransitionId): TransitionState {
    const contributions = driverContributions(
      transition,
      arousal,
      { touchingSurface: movement.hasArrived() },
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
        });
        behaviour = item.definition.to;
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
    }
  }

  function currentSpeed(): number {
    switch (behaviour) {
      case "immobility":
      case "grooming":
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
      behaviour,
      ...movement.pose(),
      speedMetresPerSecond: currentSpeed(),
      arousal,
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
      fireDueTransition();
      updateArousal();
      if (behaviour === "walking") walk();
      if (behaviour === "flying")
        movement.fly(parameters.flightSpeedMetresPerSecond * STEP_SECONDS);
      const { surface } = movement.pose();
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
    record: () => ({
      modelVersion: MODEL_VERSION,
      seed,
      room,
      parameters,
      stepsPerSecond: STEPS_PER_SECOND,
      samples: [...samples],
      firedTransitions: [...firedTransitions],
      timeOnSurfaceSeconds: Object.fromEntries(
        SURFACES.map((surface) => [surface, (stepsOnSurface.get(surface) ?? 0) * STEP_SECONDS]),
      ) as Record<Surface, number>,
      timeInBehaviourSeconds: Object.fromEntries(
        BEHAVIOURS.map((each) => [each, (stepsInBehaviour.get(each) ?? 0) * STEP_SECONDS]),
      ) as Record<Behaviour, number>,
    }),
  };
}
