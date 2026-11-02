export type Behaviour = "immobility" | "grooming" | "walking" | "flying" | "sleeping";

export type VigilanceState = "awake" | "asleep";

export type DriverId =
  "spontaneous" | "arousal" | "contact" | "light" | "sleepPressure" | "circadian" | "startle";

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
  | "sleeping-to-immobility";

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
];

export const DRIVERS: readonly DriverId[] = [
  "spontaneous",
  "arousal",
  "contact",
  "light",
  "sleepPressure",
  "circadian",
  "startle",
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
}

/**
 * Model values for Phases 1 and 2. They are roughly tuned so that about 10 simulated minutes
 * shows all four awake behaviours and a longer run shows sleep. They are not validated:
 * every relationship here is Provisional.
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
  readonly arousalTimeConstantSeconds: number;
  /** Size of arousal's random drift, per square root of a second. */
  readonly arousalNoise: number;
  readonly initialArousal: number;
  /** Rates are per second. */
  readonly startWalkingSpontaneousRate: number;
  readonly startWalkingArousalRate: number;
  /** Light the fly senses acts at once, unlike its slow effect on the clock. */
  readonly startWalkingLightRate: number;
  readonly stopWalkingSpontaneousRate: number;
  readonly stopWalkingLowArousalRate: number;
  /** Grooming has no contamination model, so nothing about dirt drives these. */
  readonly startGroomingSpontaneousRate: number;
  readonly startGroomingArousalRate: number;
  readonly stopGroomingSpontaneousRate: number;
  readonly walkAfterGroomingSpontaneousRate: number;
  readonly walkAfterGroomingArousalRate: number;
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
}

export const DEFAULT_PARAMETERS: ModelParameters = {
  arousalTargetImmobile: 0.05,
  arousalTargetGrooming: 0.3,
  arousalTargetWalking: 0.75,
  arousalTargetFlying: 0.9,
  arousalTargetSleeping: 0.02,
  arousalTimeConstantSeconds: 120,
  arousalNoise: 0.015,
  initialArousal: 0.5,
  startWalkingSpontaneousRate: 0.002,
  startWalkingArousalRate: 0.25,
  startWalkingLightRate: 0.002,
  stopWalkingSpontaneousRate: 0.02,
  stopWalkingLowArousalRate: 0.06,
  startGroomingSpontaneousRate: 0.004,
  startGroomingArousalRate: 0.05,
  stopGroomingSpontaneousRate: 0.04,
  walkAfterGroomingSpontaneousRate: 0.005,
  walkAfterGroomingArousalRate: 0.03,
  takeOffFromImmobilitySpontaneousRate: 0.003,
  takeOffFromImmobilityArousalRate: 0.02,
  takeOffFromWalkingSpontaneousRate: 0.012,
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
};

const NO_CONTRIBUTIONS: Readonly<Record<DriverId, number>> = {
  spontaneous: 0,
  arousal: 0,
  contact: 0,
  light: 0,
  sleepPressure: 0,
  circadian: 0,
  startle: 0,
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
  const { arousal, sleepPressure, sleepDepth, circadianPhaseHours, startle } = state;
  switch (transition) {
    case "immobility-to-walking":
      return {
        ...NO_CONTRIBUTIONS,
        spontaneous: parameters.startWalkingSpontaneousRate,
        arousal: parameters.startWalkingArousalRate * arousal * arousal,
        light: parameters.startWalkingLightRate * senses.lightLevel,
        startle: parameters.startWalkingStartleRate * startle,
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
  }
}
