import { exp, power, sin, tanh } from "./exactMath";
import type { ModelParameters } from "./parameters";

export type Behaviour =
  "immobility" | "grooming" | "walking" | "flying" | "sleeping" | "feeding" | "drinking";

export type VigilanceState = "awake" | "asleep";

export type DriverId =
  | "spontaneous"
  | "arousal"
  | "contact"
  | "light"
  | "sleepPressure"
  | "circadian"
  | "startle"
  | "hunger"
  | "odour"
  | "thirst"
  | "humidity";

export type TransitionId =
  | "immobility-to-walking"
  | "immobility-to-grooming"
  | "immobility-to-flying"
  | "grooming-to-immobility"
  | "grooming-to-walking"
  | "walking-to-immobility"
  | "walking-to-flying"
  | "flying-to-immobility"
  | "immobility-to-sleeping"
  | "sleeping-to-immobility"
  | "immobility-to-feeding"
  | "walking-to-feeding"
  | "feeding-to-immobility"
  | "immobility-to-drinking"
  | "walking-to-drinking"
  | "drinking-to-immobility";

export interface TransitionDefinition {
  readonly id: TransitionId;
  readonly from: Behaviour;
  readonly to: Behaviour;
}

export const BEHAVIOURS: readonly Behaviour[] = [
  "immobility",
  "grooming",
  "walking",
  "flying",
  "sleeping",
  "feeding",
  "drinking",
];

export const DRIVERS: readonly DriverId[] = [
  "spontaneous",
  "arousal",
  "contact",
  "light",
  "sleepPressure",
  "circadian",
  "startle",
  "hunger",
  "odour",
  "thirst",
  "humidity",
];

export const TRANSITIONS: readonly TransitionDefinition[] = [
  { id: "immobility-to-walking", from: "immobility", to: "walking" },
  { id: "immobility-to-grooming", from: "immobility", to: "grooming" },
  { id: "immobility-to-flying", from: "immobility", to: "flying" },
  { id: "grooming-to-immobility", from: "grooming", to: "immobility" },
  { id: "grooming-to-walking", from: "grooming", to: "walking" },
  { id: "walking-to-immobility", from: "walking", to: "immobility" },
  { id: "walking-to-flying", from: "walking", to: "flying" },
  { id: "flying-to-immobility", from: "flying", to: "immobility" },
  { id: "immobility-to-sleeping", from: "immobility", to: "sleeping" },
  { id: "sleeping-to-immobility", from: "sleeping", to: "immobility" },
  { id: "immobility-to-feeding", from: "immobility", to: "feeding" },
  { id: "walking-to-feeding", from: "walking", to: "feeding" },
  { id: "feeding-to-immobility", from: "feeding", to: "immobility" },
  { id: "immobility-to-drinking", from: "immobility", to: "drinking" },
  { id: "walking-to-drinking", from: "walking", to: "drinking" },
  { id: "drinking-to-immobility", from: "drinking", to: "immobility" },
];

/** Sleep is a behaviour, and the fly's true Vigilance State is derived from it. */
export function vigilanceStateOf(behaviour: Behaviour): VigilanceState {
  return behaviour === "sleeping" ? "asleep" : "awake";
}

/** What the fly can currently sense, the only route from the world to its hazards. */
export interface Senses {
  /** Whether a flying fly has reached a surface it can land on. */
  readonly touchingSurface: boolean;
  /** How bright the Room is here, from 0 to 1. */
  readonly lightLevel: number;
  /** Whether its feet are on the food. */
  readonly touchingFood: boolean;
  /** Whether its feet are on the water. */
  readonly touchingWater: boolean;
  /** The Odour Field where the fly is, from 0 to 1. It senses nothing of where the food is. */
  readonly odour: number;
  /** The Humidity Field where the fly is, from 0 to 1. It senses nothing of where the water is. */
  readonly humidity: number;
}

/** The fly's hidden state that Drivers read. */
export interface InternalState {
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
  /** The energy reserve, from 0 when empty to 1 when full. It falls with use and rises with intake. */
  readonly energy: number;
  /** Rises as the energy reserve falls, from 0 when full to 1 when empty. */
  readonly hunger: number;
  /**
   * The hydration reserve, from 0 when empty to 1 when full. It falls all the time and rises
   * with drinking.
   */
  readonly hydration: number;
  /** Rises as the hydration reserve falls, from 0 when full to 1 when empty. */
  readonly thirst: number;
  /**
   * The odour the fly has sensed lately, which follows what it senses with a short lag.
   * Comparing the two tells it whether the odour is rising or falling as it walks.
   */
  readonly recentOdour: number;
  /** The humidity the fly has sensed lately, which it compares with what it senses now. */
  readonly recentHumidity: number;
}

/** Hunger rises as the energy reserve falls. */
export function hungerOf(energy: number): number {
  return 1 - energy;
}

/** Thirst rises as the hydration reserve falls. */
export function thirstOf(hydration: number): number {
  return 1 - hydration;
}

const NO_CONTRIBUTIONS: Readonly<Record<DriverId, number>> = {
  spontaneous: 0,
  arousal: 0,
  contact: 0,
  light: 0,
  sleepPressure: 0,
  circadian: 0,
  startle: 0,
  hunger: 0,
  odour: 0,
  thirst: 0,
  humidity: 0,
};

/**
 * How open the clock holds the way to sleep, from 0 to 1. It has two peaks of the same shape,
 * the midday siesta and the night, with shut gates around subjective dawn and dusk, which
 * leaves a morning and evening of activity. The siesta's peak is lower by its strength.
 */
function sleepGate(circadianPhaseHours: number, parameters: ModelParameters): number {
  const dayPositive = sin((2 * Math.PI * circadianPhaseHours) / 24);
  // Squared, the gate shuts gradually towards dawn and dusk. With the night's gate as a square
  // root and the siesta's as a fourth power, as before model 0.8.0, no parameter values gave
  // the published daily profile's sharp dusk and gradual pre-dawn fall (#73).
  const shape = dayPositive * dayPositive;
  return dayPositive > 0 ? parameters.siestaGateStrength * shape : shape;
}

/**
 * How much a walking fly turns, as a multiple of its usual turning. It reads only the odour
 * it senses and has sensed lately, so it can't head for food it can't smell. Without any
 * odour this is exactly 1, so a fly out of range walks as if there were no food.
 */
export function turningScale(
  state: InternalState,
  senses: Senses,
  parameters: ModelParameters,
): number {
  const odourChange =
    (senses.odour - state.recentOdour) / (state.recentOdour + parameters.odourDetectionFloor);
  const odourRising = tanh(odourChange / parameters.odourContrast);
  const humidityRising = tanh(
    (senses.humidity - state.recentHumidity) / parameters.humidityContrast,
  );
  // Hunger sets how much odour matters and Thirst how much humidity does.
  return exp(
    -parameters.odourSteeringGain * state.hunger * odourRising -
      parameters.humiditySteeringGain * state.thirst * humidityRising,
  );
}

/** How far the air is above the Room's humidity, from 0 away from the water to 1 at it. */
function dampness(senses: Senses, parameters: ModelParameters): number {
  return parameters.humidityRise > 0
    ? Math.max(0, (senses.humidity - parameters.globalHumidity) / parameters.humidityRise)
    : 0;
}

/** Transitions that take effort to start, which a weak fly starts less often. */
const EFFORTFUL: ReadonlySet<TransitionId> = new Set<TransitionId>([
  "immobility-to-walking",
  "immobility-to-grooming",
  "grooming-to-walking",
  "immobility-to-flying",
  "walking-to-flying",
]);

/**
 * How much of its pushes towards effortful behaviour Weakness leaves the fly, from 1 with
 * enough of both reserves down to 0 as either runs out.
 */
function strengthLeft(state: InternalState, parameters: ModelParameters): number {
  const reserve = Math.min(state.energy, state.hydration);
  return power(Math.min(1, reserve / parameters.weaknessReserve), 2);
}

/**
 * Each Driver's share of a Transition Hazard, per second. The contributions add
 * up to the hazard, so a bar of them shows directly what is pushing a transition.
 * Only the current Drivers affect a hazard, so time spent in a bout can't. A weak fly's
 * Drivers push less towards effortful behaviour, which shrinks the whole bar.
 */
export function driverContributions(
  transition: TransitionId,
  state: InternalState,
  senses: Senses,
  parameters: ModelParameters,
): Record<DriverId, number> {
  const contributions = unweakenedContributions(transition, state, senses, parameters);
  if (!EFFORTFUL.has(transition)) return contributions;
  const strength = strengthLeft(state, parameters);
  if (strength === 1) return contributions;
  return Object.fromEntries(
    DRIVERS.map((driver) => [driver, contributions[driver] * strength]),
  ) as Record<DriverId, number>;
}

function unweakenedContributions(
  transition: TransitionId,
  state: InternalState,
  senses: Senses,
  parameters: ModelParameters,
): Record<DriverId, number> {
  const { arousal, sleepPressure, sleepDepth, circadianPhaseHours, startle, hunger, thirst } =
    state;
  const onFood = senses.touchingFood ? 1 : 0;
  const onWater = senses.touchingWater ? 1 : 0;
  const damp = dampness(senses, parameters);
  switch (transition) {
    case "immobility-to-walking":
      return {
        ...NO_CONTRIBUTIONS,
        spontaneous: parameters.startWalkingSpontaneousRate,
        arousal: parameters.startWalkingArousalRate * arousal * arousal,
        light: parameters.startWalkingLightRate * senses.lightLevel,
        startle: parameters.startWalkingStartleRate * startle,
        hunger: parameters.startWalkingHungerRate * power(hunger, 4),
        odour: parameters.startWalkingOdourRate * senses.odour * hunger,
        thirst: parameters.startWalkingThirstRate * power(thirst, 4),
        humidity: parameters.startWalkingHumidityRate * damp * thirst,
      };
    case "immobility-to-grooming":
      return {
        ...NO_CONTRIBUTIONS,
        spontaneous: parameters.startGroomingSpontaneousRate,
        arousal: parameters.startGroomingArousalRate * arousal,
      };
    case "grooming-to-immobility":
      return { ...NO_CONTRIBUTIONS, spontaneous: parameters.stopGroomingSpontaneousRate };
    case "grooming-to-walking":
      return {
        ...NO_CONTRIBUTIONS,
        spontaneous: parameters.walkAfterGroomingSpontaneousRate,
        arousal: parameters.walkAfterGroomingArousalRate * arousal,
        startle: parameters.walkAfterGroomingStartleRate * startle,
        hunger: parameters.walkAfterGroomingHungerRate * power(hunger, 4),
        odour: parameters.walkAfterGroomingOdourRate * senses.odour * hunger,
        thirst: parameters.walkAfterGroomingThirstRate * power(thirst, 4),
        humidity: parameters.walkAfterGroomingHumidityRate * damp * thirst,
      };
    case "immobility-to-flying":
      return {
        ...NO_CONTRIBUTIONS,
        spontaneous: parameters.takeOffFromImmobilitySpontaneousRate,
        arousal: parameters.takeOffFromImmobilityArousalRate * arousal * arousal,
        startle: parameters.takeOffFromImmobilityStartleRate * startle,
      };
    case "walking-to-immobility":
      return {
        ...NO_CONTRIBUTIONS,
        spontaneous: parameters.stopWalkingSpontaneousRate,
        arousal: parameters.stopWalkingLowArousalRate * (1 - arousal),
      };
    case "walking-to-flying":
      return {
        ...NO_CONTRIBUTIONS,
        spontaneous: parameters.takeOffFromWalkingSpontaneousRate,
        arousal: parameters.takeOffFromWalkingArousalRate * arousal * arousal,
        startle: parameters.takeOffFromWalkingStartleRate * startle,
      };
    case "flying-to-immobility":
      return {
        ...NO_CONTRIBUTIONS,
        contact: senses.touchingSurface ? parameters.landingContactRate : 0,
      };
    case "immobility-to-sleeping": {
      const settled = (1 - arousal) * (1 - arousal);
      return {
        ...NO_CONTRIBUTIONS,
        sleepPressure: parameters.fallAsleepSleepPressureRate * sleepPressure * settled,
        circadian:
          parameters.fallAsleepCircadianRate * sleepGate(circadianPhaseHours, parameters) * settled,
      };
    }
    case "sleeping-to-immobility": {
      // Deeper sleep shrinks every Driver's push, which shrinks the whole bar.
      const easeOfWaking = 1 - parameters.wakeSleepDepthReduction * (sleepDepth ?? 0);
      return {
        ...NO_CONTRIBUTIONS,
        spontaneous: parameters.wakeSpontaneousRate * easeOfWaking,
        light: parameters.wakeLightRate * senses.lightLevel * easeOfWaking,
        sleepPressure: parameters.wakeLowSleepPressureRate * (1 - sleepPressure) * easeOfWaking,
        circadian:
          parameters.wakeCircadianRate *
          (1 - sleepGate(circadianPhaseHours, parameters)) *
          easeOfWaking,
        // Sleep Depth blunts an outside stimulus more than it blunts waking from within.
        startle: parameters.wakeStartleRate * startle * easeOfWaking * easeOfWaking,
      };
    }
    case "immobility-to-feeding":
    case "walking-to-feeding":
      // Thirst holds feeding back by weakening Hunger's push, so a thirsty fly drinks first.
      return {
        ...NO_CONTRIBUTIONS,
        hunger:
          parameters.startFeedingHungerRate *
          power(hunger, 3) *
          (1 - parameters.feedingThirstInhibition * thirst) *
          onFood,
      };
    case "feeding-to-immobility":
      return {
        ...NO_CONTRIBUTIONS,
        hunger: parameters.stopFeedingLowHungerRate * power(1 - hunger, 4),
        startle: parameters.stopFeedingStartleRate * startle,
        contact: senses.touchingFood ? 0 : parameters.lostContactRate,
      };
    case "immobility-to-drinking":
    case "walking-to-drinking":
      return {
        ...NO_CONTRIBUTIONS,
        thirst: parameters.startDrinkingThirstRate * power(thirst, 3) * onWater,
      };
    case "drinking-to-immobility":
      return {
        ...NO_CONTRIBUTIONS,
        thirst: parameters.stopDrinkingLowThirstRate * power(1 - thirst, 4),
        startle: parameters.stopDrinkingStartleRate * startle,
        contact: senses.touchingWater ? 0 : parameters.lostContactRate,
      };
  }
}
