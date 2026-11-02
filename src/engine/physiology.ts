import {
  hungerOf,
  thirstOf,
  vigilanceStateOf,
  type Behaviour,
  type InternalState,
  type Senses,
} from "./model";
import type { ModelParameters } from "./parameters";
import type { RandomStream } from "./random";

/** The simulation always advances in fixed steps of this rate. */
export const STEPS_PER_SECOND = 50;

export const STEP_SECONDS = 1 / STEPS_PER_SECOND;
const SQRT_STEP_SECONDS = Math.sqrt(STEP_SECONDS);
const STEP_HOURS = STEP_SECONDS / 3600;

const MIN_STARTLE = 1e-6;

/** The fly's hidden state, less Hunger and Thirst, which are read off its reserves. */
export type BodyState = Omit<InternalState, "hunger" | "thirst">;

/** The random streams the state's own noise comes from. */
export interface BodyNoise {
  readonly arousal: RandomStream;
  readonly sleepDepth: RandomStream;
}

/** The state at the start of a run. The fly starts used to what it senses where it starts. */
export function initialBodyState(parameters: ModelParameters, senses: Senses): BodyState {
  return {
    arousal: parameters.initialArousal,
    sleepPressure: parameters.initialSleepPressure,
    sleepDepth: null,
    circadianPhaseHours: 0,
    startle: 0,
    energy: parameters.initialEnergy,
    hydration: parameters.initialHydration,
    recentOdour: senses.odour,
    recentHumidity: senses.humidity,
  };
}

/** The state that Drivers read, with Hunger and Thirst. */
export function internalStateOf(body: BodyState): InternalState {
  return {
    arousal: body.arousal,
    sleepPressure: body.sleepPressure,
    sleepDepth: body.sleepDepth,
    circadianPhaseHours: body.circadianPhaseHours,
    startle: body.startle,
    energy: body.energy,
    hunger: hungerOf(body.energy),
    hydration: body.hydration,
    thirst: thirstOf(body.hydration),
    recentOdour: body.recentOdour,
    recentHumidity: body.recentHumidity,
  };
}

/**
 * One step of arousal, Sleep Pressure, Sleep Depth, the Circadian Clock, Startle and the
 * Energy and Hydration Reserves, given what the fly is doing and sensing. What it has sensed
 * lately is left to {@link adaptToSenses}, as steering reads it first.
 */
export function advanceBodyState(
  body: BodyState,
  behaviour: Behaviour,
  senses: Senses,
  parameters: ModelParameters,
  noise: BodyNoise,
): BodyState {
  const sleepPressure = nextSleepPressure(body.sleepPressure, behaviour, parameters);
  return {
    ...body,
    arousal: nextArousal(body.arousal, behaviour, parameters, noise.arousal),
    sleepPressure,
    sleepDepth: nextSleepDepth(body.sleepDepth, sleepPressure, parameters, noise.sleepDepth),
    circadianPhaseHours: nextCircadianPhase(body.circadianPhaseHours, senses, parameters),
    startle: nextStartle(body.startle, parameters),
    energy: nextEnergy(body.energy, behaviour, senses, parameters),
    hydration: nextHydration(body.hydration, behaviour, senses, parameters),
  };
}

/** What the fly has sensed lately follows what it senses now, which is how it notices change. */
export function adaptToSenses(
  body: BodyState,
  senses: Senses,
  parameters: ModelParameters,
): BodyState {
  return {
    ...body,
    recentOdour:
      body.recentOdour +
      ((senses.odour - body.recentOdour) / parameters.odourAdaptationSeconds) * STEP_SECONDS,
    recentHumidity:
      body.recentHumidity +
      ((senses.humidity - body.recentHumidity) / parameters.humidityAdaptationSeconds) *
        STEP_SECONDS,
  };
}

function arousalTarget(behaviour: Behaviour, parameters: ModelParameters): number {
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
    case "feeding":
      return parameters.arousalTargetFeeding;
    case "drinking":
      return parameters.arousalTargetDrinking;
  }
}

function nextArousal(
  arousal: number,
  behaviour: Behaviour,
  parameters: ModelParameters,
  noise: RandomStream,
): number {
  const target = arousalTarget(behaviour, parameters);
  const next =
    arousal +
    ((target - arousal) / parameters.arousalTimeConstantSeconds) * STEP_SECONDS +
    parameters.arousalNoise * SQRT_STEP_SECONDS * noise.normal();
  return Math.min(1, Math.abs(next));
}

function nextSleepPressure(
  sleepPressure: number,
  behaviour: Behaviour,
  parameters: ModelParameters,
): number {
  return (
    sleepPressure +
    (vigilanceStateOf(behaviour) === "asleep"
      ? (-sleepPressure / parameters.sleepPressureFallTimeConstantSeconds) * STEP_SECONDS
      : ((1 - sleepPressure) / parameters.sleepPressureRiseTimeConstantSeconds) * STEP_SECONDS)
  );
}

/** Follows sleep pressure and its own noise. Nothing here knows how long the bout has lasted. */
function nextSleepDepth(
  sleepDepth: number | null,
  sleepPressure: number,
  parameters: ModelParameters,
  noise: RandomStream,
): number | null {
  if (sleepDepth === null) return null;
  const target =
    parameters.sleepDepthBaseTarget + parameters.sleepDepthSleepPressureGain * sleepPressure;
  const next =
    sleepDepth +
    ((target - sleepDepth) / parameters.sleepDepthTimeConstantSeconds) * STEP_SECONDS +
    parameters.sleepDepthNoise * SQRT_STEP_SECONDS * noise.normal();
  return Math.min(1, Math.abs(next));
}

/**
 * Which way light moves the clock at each phase, from -1 for back to 1 for forwards.
 * Light in the clock's day has no effect, so a clock in step with its schedule stays put.
 * Light early in its night holds it back and light late in its night pushes it on, which
 * moves the clock's night away from the light a little each day until the two agree.
 */
function lightPull(circadianPhaseHours: number): number {
  return circadianPhaseHours < 12 ? 0 : -Math.cos((Math.PI * (circadianPhaseHours - 12)) / 12);
}

/** Light reaches the clock only through the fly's senses, and can stop it but not reverse it. */
function nextCircadianPhase(
  circadianPhaseHours: number,
  senses: Senses,
  parameters: ModelParameters,
): number {
  const clockHoursPerHour = Math.max(
    0,
    24 / parameters.circadianPeriodHours +
      parameters.clockEntrainmentRate * senses.lightLevel * lightPull(circadianPhaseHours),
  );
  return (circadianPhaseHours + clockHoursPerHour * STEP_HOURS) % 24;
}

function nextStartle(startle: number, parameters: ModelParameters): number {
  const next = startle * Math.exp(-STEP_SECONDS / parameters.startleTimeConstantSeconds);
  // Ends a faded startle outright, so that it leaves no trace in later hazards.
  return next < MIN_STARTLE ? 0 : next;
}

function energyUse(behaviour: Behaviour, parameters: ModelParameters): number {
  switch (behaviour) {
    case "immobility":
    case "grooming":
    case "feeding":
    case "drinking":
      return parameters.energyUseResting;
    case "walking":
      return parameters.energyUseWalking;
    case "flying":
      return parameters.energyUseFlying;
    case "sleeping":
      return parameters.energyUseSleeping;
  }
}

function nextEnergy(
  energy: number,
  behaviour: Behaviour,
  senses: Senses,
  parameters: ModelParameters,
): number {
  // Only what the fly is touching can be taken in.
  const intake = behaviour === "feeding" && senses.touchingFood ? parameters.feedingIntake : 0;
  return Math.min(
    1,
    Math.max(0, energy + (intake - energyUse(behaviour, parameters)) * STEP_SECONDS),
  );
}

function waterLoss(behaviour: Behaviour, parameters: ModelParameters): number {
  switch (behaviour) {
    case "immobility":
    case "grooming":
    case "feeding":
    case "drinking":
      return parameters.waterLossResting;
    case "walking":
      return parameters.waterLossWalking;
    case "flying":
      return parameters.waterLossFlying;
    case "sleeping":
      return parameters.waterLossSleeping;
  }
}

function nextHydration(
  hydration: number,
  behaviour: Behaviour,
  senses: Senses,
  parameters: ModelParameters,
): number {
  const intake = behaviour === "drinking" && senses.touchingWater ? parameters.drinkingIntake : 0;
  return Math.min(
    1,
    Math.max(0, hydration + (intake - waterLoss(behaviour, parameters)) * STEP_SECONDS),
  );
}
