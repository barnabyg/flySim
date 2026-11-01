export type Behaviour = "immobility" | "grooming" | "walking" | "flying";

export type DriverId = "spontaneous" | "arousal" | "contact";

export type TransitionId =
  | "immobility-to-walking"
  | "immobility-to-grooming"
  | "immobility-to-flying"
  | "grooming-to-immobility"
  | "grooming-to-walking"
  | "walking-to-immobility"
  | "walking-to-flying"
  | "flying-to-immobility";

export interface TransitionDefinition {
  readonly id: TransitionId;
  readonly from: Behaviour;
  readonly to: Behaviour;
}

export const BEHAVIOURS: readonly Behaviour[] = ["immobility", "grooming", "walking", "flying"];

export const DRIVERS: readonly DriverId[] = ["spontaneous", "arousal", "contact"];

export const TRANSITIONS: readonly TransitionDefinition[] = [
  { id: "immobility-to-walking", from: "immobility", to: "walking" },
  { id: "immobility-to-grooming", from: "immobility", to: "grooming" },
  { id: "immobility-to-flying", from: "immobility", to: "flying" },
  { id: "grooming-to-immobility", from: "grooming", to: "immobility" },
  { id: "grooming-to-walking", from: "grooming", to: "walking" },
  { id: "walking-to-immobility", from: "walking", to: "immobility" },
  { id: "walking-to-flying", from: "walking", to: "flying" },
  { id: "flying-to-immobility", from: "flying", to: "immobility" },
];

/** What the fly can currently sense, the only route from the world to its hazards. */
export interface Senses {
  /** Whether a flying fly has reached a surface it can land on. */
  readonly touchingSurface: boolean;
}

/**
 * Model values for Phase 1. They are roughly tuned so that about 10 simulated minutes
 * shows every behaviour. They are not validated: every relationship here is Provisional.
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
  readonly arousalTimeConstantSeconds: number;
  /** Size of arousal's random drift, per square root of a second. */
  readonly arousalNoise: number;
  readonly initialArousal: number;
  /** Rates are per second. */
  readonly startWalkingSpontaneousRate: number;
  readonly startWalkingArousalRate: number;
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
  arousalTimeConstantSeconds: 120,
  arousalNoise: 0.015,
  initialArousal: 0.5,
  startWalkingSpontaneousRate: 0.002,
  startWalkingArousalRate: 0.25,
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
  walkingSpeedMetresPerSecond: 0.02,
  walkingTurnNoise: 0.8,
  flightSpeedMetresPerSecond: 1,
};

/**
 * Each Driver's share of a Transition Hazard, per second. The contributions add
 * up to the hazard, so a bar of them shows directly what is pushing a transition.
 * Only the current Drivers affect a hazard, so time spent in a bout can't.
 */
export function driverContributions(
  transition: TransitionId,
  arousal: number,
  senses: Senses,
  parameters: ModelParameters,
): Record<DriverId, number> {
  switch (transition) {
    case "immobility-to-walking":
      return {
        spontaneous: parameters.startWalkingSpontaneousRate,
        arousal: parameters.startWalkingArousalRate * arousal * arousal,
        contact: 0,
      };
    case "immobility-to-grooming":
      return {
        spontaneous: parameters.startGroomingSpontaneousRate,
        arousal: parameters.startGroomingArousalRate * arousal,
        contact: 0,
      };
    case "grooming-to-immobility":
      return {
        spontaneous: parameters.stopGroomingSpontaneousRate,
        arousal: 0,
        contact: 0,
      };
    case "grooming-to-walking":
      return {
        spontaneous: parameters.walkAfterGroomingSpontaneousRate,
        arousal: parameters.walkAfterGroomingArousalRate * arousal,
        contact: 0,
      };
    case "immobility-to-flying":
      return {
        spontaneous: parameters.takeOffFromImmobilitySpontaneousRate,
        arousal: parameters.takeOffFromImmobilityArousalRate * arousal * arousal,
        contact: 0,
      };
    case "walking-to-immobility":
      return {
        spontaneous: parameters.stopWalkingSpontaneousRate,
        arousal: parameters.stopWalkingLowArousalRate * (1 - arousal),
        contact: 0,
      };
    case "walking-to-flying":
      return {
        spontaneous: parameters.takeOffFromWalkingSpontaneousRate,
        arousal: parameters.takeOffFromWalkingArousalRate * arousal * arousal,
        contact: 0,
      };
    case "flying-to-immobility":
      return {
        spontaneous: 0,
        arousal: 0,
        contact: senses.touchingSurface ? parameters.landingContactRate : 0,
      };
  }
}
