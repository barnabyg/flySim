import {
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
import { createRandomStream } from "./random";

export const MODEL_VERSION = "0.1.0";

/** The simulation always advances in fixed steps of this rate. */
export const STEPS_PER_SECOND = 50;

const STEP_SECONDS = 1 / STEPS_PER_SECOND;
const SQRT_STEP_SECONDS = Math.sqrt(STEP_SECONDS);

/** The fly's half-length, which keeps its body inside the Room. */
const BODY_MARGIN_METRES = 0.00125;

const DRIVER_NOISE_STREAM = 1;
const MOVEMENT_STREAM = 2;
const DEFAULT_TRIGGER_STREAM = 3;

export interface RoomSetup {
  readonly widthMetres: number;
  readonly depthMetres: number;
  readonly heightMetres: number;
}

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

export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
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
  readonly position: Position;
  /** Radians anticlockwise from the +x axis. */
  readonly heading: number;
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
  let x = room.widthMetres * (0.25 + 0.5 * movementNoise.uniform());
  let y = room.depthMetres * (0.25 + 0.5 * movementNoise.uniform());
  let heading = 2 * Math.PI * movementNoise.uniform();
  let pending = drawTriggerLevels();

  function drawTriggerLevels(): PendingTransition[] {
    return TRANSITIONS.filter((definition) => definition.from === behaviour).map((definition) => ({
      definition,
      triggerLevel: triggerLevelStream.exponential(),
      accumulatedHazard: 0,
    }));
  }

  function transitionState(transition: TransitionId): TransitionState {
    const contributions = driverContributions(transition, arousal, parameters);
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
        pending = drawTriggerLevels();
        return;
      }
    }
  }

  function updateArousal(): void {
    const target =
      behaviour === "walking" ? parameters.arousalTargetWalking : parameters.arousalTargetImmobile;
    const next =
      arousal +
      ((target - arousal) / parameters.arousalTimeConstantSeconds) * STEP_SECONDS +
      parameters.arousalNoise * SQRT_STEP_SECONDS * driverNoise.normal();
    arousal = Math.min(1, Math.abs(next));
  }

  function walk(): void {
    heading += parameters.walkingTurnNoise * SQRT_STEP_SECONDS * movementNoise.normal();
    let dx = parameters.walkingSpeedMetresPerSecond * STEP_SECONDS * Math.cos(heading);
    let dy = parameters.walkingSpeedMetresPerSecond * STEP_SECONDS * Math.sin(heading);
    if (x + dx < BODY_MARGIN_METRES || x + dx > room.widthMetres - BODY_MARGIN_METRES) {
      dx = -dx;
      heading = Math.atan2(dy, dx);
    }
    if (y + dy < BODY_MARGIN_METRES || y + dy > room.depthMetres - BODY_MARGIN_METRES) {
      dy = -dy;
      heading = Math.atan2(dy, dx);
    }
    x += dx;
    y += dy;
  }

  function current(): RunSample {
    return {
      step,
      timeSeconds: step * STEP_SECONDS,
      behaviour,
      position: { x, y, z: 0 },
      heading,
      speedMetresPerSecond: behaviour === "walking" ? parameters.walkingSpeedMetresPerSecond : 0,
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
    }),
  };
}
