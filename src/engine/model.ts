export type Behaviour = "immobility" | "grooming" | "walking" | "flying" | "sleeping" | "feeding";

export type VigilanceState = "awake" | "asleep";

export type DriverId =
  | "spontaneous"
  | "arousal"
  | "contact"
  | "light"
  | "sleepPressure"
  | "circadian"
  | "startle"
  | "hunger";

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
  | "feeding-to-immobility";

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
}

/** Hunger rises as the energy reserve falls. */
export function hungerOf(energy: number): number {
  return 1 - energy;
}

/**
 * Model values for Phases 1 to 3. They are roughly tuned so that about 10 simulated minutes
 * shows all four awake behaviours, a settled fly often stays in awake Immobility for more than
 * 5 minutes, a day shows a morning, siesta, evening and night of sleep, and a part-fed fly
 * finds food within hours. They are not validated: every relationship here is Provisional,
 * including energy use, intake and how Hunger acts.
 */
export interface ModelParameters {
  /** Arousal relaxes towards this level during Immobility. */
  readonly arousalTargetImmobile: number;
  /** Arousal relaxes towards this level while grooming. */
  readonly arousalTargetGrooming: number;
  /** Arousal relaxes towards this level while walking. */
  readonly arousalTargetWalking: number;
  /** Arousal relaxes towards this level in flight. */
  readonly arousalTargetFlying: number;
  /** Arousal relaxes towards this level during sleep. */
  readonly arousalTargetSleeping: number;
  /** Arousal relaxes towards this level while feeding. */
  readonly arousalTargetFeeding: number;
  readonly arousalTimeConstantSeconds: number;
  /** Size of arousal's random drift, per square root of a second. */
  readonly arousalNoise: number;
  readonly initialArousal: number;
  /** Rates are per second. */
  readonly startWalkingSpontaneousRate: number;
  readonly startWalkingArousalRate: number;
  /** Light the fly senses acts at once, unlike its slow effect on the clock. */
  readonly startWalkingLightRate: number;
  /** Scaled by Hunger squared, so a part-fed fly still settles for minutes at a time. */
  readonly startWalkingHungerRate: number;
  readonly stopWalkingSpontaneousRate: number;
  readonly stopWalkingLowArousalRate: number;
  /** Grooming has no contamination model, so nothing about dirt drives these. */
  readonly startGroomingSpontaneousRate: number;
  readonly startGroomingArousalRate: number;
  readonly stopGroomingSpontaneousRate: number;
  readonly walkAfterGroomingSpontaneousRate: number;
  readonly walkAfterGroomingArousalRate: number;
  readonly walkAfterGroomingHungerRate: number;
  readonly takeOffFromImmobilitySpontaneousRate: number;
  readonly takeOffFromImmobilityArousalRate: number;
  readonly takeOffFromWalkingSpontaneousRate: number;
  readonly takeOffFromWalkingArousalRate: number;
  /** Contact ends a flight almost at once, so a fly doesn't linger at a surface. */
  readonly landingContactRate: number;
  /** Sleep pressure relaxes towards 1 at this pace while awake. */
  readonly sleepPressureRiseTimeConstantSeconds: number;
  /** Sleep pressure relaxes towards 0 at this pace while asleep. */
  readonly sleepPressureFallTimeConstantSeconds: number;
  readonly initialSleepPressure: number;
  /** Scaled by sleep pressure, and by how far low arousal has let the fly settle. */
  readonly fallAsleepSleepPressureRate: number;
  readonly wakeSpontaneousRate: number;
  /** Scaled by how far sleep has discharged sleep pressure. */
  readonly wakeLowSleepPressureRate: number;
  /** Sleep Depth on falling asleep, from where it relaxes towards its target. */
  readonly sleepDepthAtOnset: number;
  /** Sleep Depth relaxes towards this plus the gain times sleep pressure. */
  readonly sleepDepthBaseTarget: number;
  readonly sleepDepthSleepPressureGain: number;
  readonly sleepDepthTimeConstantSeconds: number;
  /** Size of Sleep Depth's random drift, per square root of a second. */
  readonly sleepDepthNoise: number;
  /** The share of the wake hazard removed at full Sleep Depth. */
  readonly wakeSleepDepthReduction: number;
  /** The internal clock's free-running day. */
  readonly circadianPeriodHours: number;
  /** How strongly light pulls the clock, in clock hours per hour at full light. */
  readonly clockEntrainmentRate: number;
  /** How much the clock opens the way to sleep at its strongest, in the middle of its night. */
  readonly fallAsleepCircadianRate: number;
  /** How much of its night-time strength the clock's sleep gate reaches at midday. */
  readonly siestaGateStrength: number;
  /** How much the clock pushes towards waking when its sleep gate is shut. */
  readonly wakeCircadianRate: number;
  /** Light pushes towards waking, so darkness helps sleep but doesn't bring it about. */
  readonly wakeLightRate: number;
  /** A startle fades at this pace, which lets it be told apart from what follows. */
  readonly startleTimeConstantSeconds: number;
  /** Rates at the full strength of a startle. */
  readonly startWalkingStartleRate: number;
  readonly walkAfterGroomingStartleRate: number;
  readonly takeOffFromImmobilityStartleRate: number;
  readonly takeOffFromWalkingStartleRate: number;
  readonly wakeStartleRate: number;
  readonly walkingSpeedMetresPerSecond: number;
  /** Size of the heading's random drift, in radians per square root of a second. */
  readonly walkingTurnNoise: number;
  /** About 1 m/s. Flight frequency and speed are both Provisional. */
  readonly flightSpeedMetresPerSecond: number;
  /** Part-fed, so that a default run is likely to feed within its first hours. */
  readonly initialEnergy: number;
  /** Shares of a full energy reserve used per second, by what the fly is doing. */
  readonly energyUseResting: number;
  readonly energyUseWalking: number;
  readonly energyUseFlying: number;
  readonly energyUseSleeping: number;
  /** Feeding can start only on the food. Scaled by Hunger. */
  readonly startFeedingHungerRate: number;
  /** Scaled by the fourth power of how far Hunger has fallen, so a bout ends as the fly fills. */
  readonly stopFeedingSatietyRate: number;
  readonly stopFeedingStartleRate: number;
  /** The share of a full energy reserve taken in per second of feeding. */
  readonly feedingIntake: number;
}

export const DEFAULT_PARAMETERS: ModelParameters = {
  arousalTargetImmobile: 0.05,
  arousalTargetGrooming: 0.3,
  arousalTargetWalking: 0.75,
  arousalTargetFlying: 0.9,
  arousalTargetSleeping: 0.02,
  arousalTargetFeeding: 0.3,
  arousalTimeConstantSeconds: 120,
  arousalNoise: 0.015,
  initialArousal: 0.5,
  startWalkingSpontaneousRate: 0.0003,
  startWalkingArousalRate: 0.25,
  startWalkingLightRate: 0.002,
  startWalkingHungerRate: 0.005,
  stopWalkingSpontaneousRate: 0.02,
  stopWalkingLowArousalRate: 0.06,
  startGroomingSpontaneousRate: 0.001,
  startGroomingArousalRate: 0.04,
  stopGroomingSpontaneousRate: 0.04,
  walkAfterGroomingSpontaneousRate: 0.005,
  walkAfterGroomingArousalRate: 0.03,
  walkAfterGroomingHungerRate: 0.02,
  takeOffFromImmobilitySpontaneousRate: 0.002,
  takeOffFromImmobilityArousalRate: 0.02,
  takeOffFromWalkingSpontaneousRate: 0.018,
  takeOffFromWalkingArousalRate: 0.06,
  landingContactRate: 100,
  sleepPressureRiseTimeConstantSeconds: 28_800,
  sleepPressureFallTimeConstantSeconds: 21_600,
  initialSleepPressure: 0.1,
  fallAsleepSleepPressureRate: 0.002,
  wakeSpontaneousRate: 0.0002,
  wakeLowSleepPressureRate: 0.0004,
  sleepDepthAtOnset: 0.05,
  sleepDepthBaseTarget: 0.2,
  sleepDepthSleepPressureGain: 1,
  sleepDepthTimeConstantSeconds: 600,
  sleepDepthNoise: 0.008,
  wakeSleepDepthReduction: 0.85,
  circadianPeriodHours: 24,
  clockEntrainmentRate: 0.4,
  fallAsleepCircadianRate: 0.012,
  siestaGateStrength: 0.35,
  wakeCircadianRate: 0.0015,
  wakeLightRate: 0.0003,
  startleTimeConstantSeconds: 8,
  startWalkingStartleRate: 3,
  walkAfterGroomingStartleRate: 2,
  takeOffFromImmobilityStartleRate: 1,
  takeOffFromWalkingStartleRate: 1,
  wakeStartleRate: 0.3,
  walkingSpeedMetresPerSecond: 0.02,
  walkingTurnNoise: 0.8,
  flightSpeedMetresPerSecond: 1,
  initialEnergy: 0.6,
  energyUseResting: 5e-6,
  energyUseWalking: 1.2e-5,
  energyUseFlying: 5e-5,
  energyUseSleeping: 3e-6,
  startFeedingHungerRate: 1,
  stopFeedingSatietyRate: 0.15,
  stopFeedingStartleRate: 2,
  feedingIntake: 0.004,
};

const NO_CONTRIBUTIONS: Readonly<Record<DriverId, number>> = {
  spontaneous: 0,
  arousal: 0,
  contact: 0,
  light: 0,
  sleepPressure: 0,
  circadian: 0,
  startle: 0,
  hunger: 0,
};

/**
 * How open the clock holds the way to sleep, from 0 to 1. It has two peaks, the midday
 * siesta and the night, with shut gates around subjective dawn and dusk. The night's
 * gate is broad and the siesta's narrow, which leaves a morning and evening of activity.
 */
function sleepGate(circadianPhaseHours: number, parameters: ModelParameters): number {
  const dayPositive = Math.sin((2 * Math.PI * circadianPhaseHours) / 24);
  return dayPositive > 0
    ? parameters.siestaGateStrength * dayPositive ** 4
    : Math.sqrt(-dayPositive);
}

/**
 * Each Driver's share of a Transition Hazard, per second. The contributions add
 * up to the hazard, so a bar of them shows directly what is pushing a transition.
 * Only the current Drivers affect a hazard, so time spent in a bout can't.
 */
export function driverContributions(
  transition: TransitionId,
  state: InternalState,
  senses: Senses,
  parameters: ModelParameters,
): Record<DriverId, number> {
  const { arousal, sleepPressure, sleepDepth, circadianPhaseHours, startle, hunger } = state;
  const onFood = senses.touchingFood ? 1 : 0;
  switch (transition) {
    case "immobility-to-walking":
      return {
        ...NO_CONTRIBUTIONS,
        spontaneous: parameters.startWalkingSpontaneousRate,
        arousal: parameters.startWalkingArousalRate * arousal * arousal,
        light: parameters.startWalkingLightRate * senses.lightLevel,
        startle: parameters.startWalkingStartleRate * startle,
        hunger: parameters.startWalkingHungerRate * hunger * hunger,
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
        hunger: parameters.walkAfterGroomingHungerRate * hunger * hunger,
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
      return { ...NO_CONTRIBUTIONS, hunger: parameters.startFeedingHungerRate * hunger * onFood };
    case "feeding-to-immobility":
      return {
        ...NO_CONTRIBUTIONS,
        hunger: parameters.stopFeedingSatietyRate * (1 - hunger) ** 4,
        startle: parameters.stopFeedingStartleRate * startle,
      };
  }
}
