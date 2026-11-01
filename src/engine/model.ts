export type Behaviour = "immobility" | "walking";

export type DriverId = "spontaneous" | "arousal";

export type TransitionId = "immobility-to-walking" | "walking-to-immobility";

export interface TransitionDefinition {
  readonly id: TransitionId;
  readonly from: Behaviour;
  readonly to: Behaviour;
}

export const BEHAVIOURS: readonly Behaviour[] = ["immobility", "walking"];

export const DRIVERS: readonly DriverId[] = ["spontaneous", "arousal"];

export const TRANSITIONS: readonly TransitionDefinition[] = [
  { id: "immobility-to-walking", from: "immobility", to: "walking" },
  { id: "walking-to-immobility", from: "walking", to: "immobility" },
];

/**
 * Model values for Phase 1. They are roughly chosen to give watchable behaviour
 * and are not validated: every relationship here is Provisional.
 */
export interface ModelParameters {
  /** Arousal relaxes towards this level during Immobility. */
  readonly arousalTargetImmobile: number;
  /** Arousal relaxes towards this level while walking. */
  readonly arousalTargetWalking: number;
  readonly arousalTimeConstantSeconds: number;
  /** Size of arousal's random drift, per square root of a second. */
  readonly arousalNoise: number;
  readonly initialArousal: number;
  /** Rates are per second. */
  readonly startWalkingSpontaneousRate: number;
  readonly startWalkingArousalRate: number;
  readonly stopWalkingSpontaneousRate: number;
  readonly stopWalkingLowArousalRate: number;
  readonly walkingSpeedMetresPerSecond: number;
  /** Size of the heading's random drift, in radians per square root of a second. */
  readonly walkingTurnNoise: number;
}

export const DEFAULT_PARAMETERS: ModelParameters = {
  arousalTargetImmobile: 0.05,
  arousalTargetWalking: 0.75,
  arousalTimeConstantSeconds: 120,
  arousalNoise: 0.015,
  initialArousal: 0.5,
  startWalkingSpontaneousRate: 0.002,
  startWalkingArousalRate: 0.25,
  stopWalkingSpontaneousRate: 0.02,
  stopWalkingLowArousalRate: 0.06,
  walkingSpeedMetresPerSecond: 0.02,
  walkingTurnNoise: 0.8,
};

/**
 * Each Driver's share of a Transition Hazard, per second. The contributions add
 * up to the hazard, so a bar of them shows directly what is pushing a transition.
 * Only the current Drivers affect a hazard, so time spent in a bout can't.
 */
export function driverContributions(
  transition: TransitionId,
  arousal: number,
  parameters: ModelParameters,
): Record<DriverId, number> {
  switch (transition) {
    case "immobility-to-walking":
      return {
        spontaneous: parameters.startWalkingSpontaneousRate,
        arousal: parameters.startWalkingArousalRate * arousal * arousal,
      };
    case "walking-to-immobility":
      return {
        spontaneous: parameters.stopWalkingSpontaneousRate,
        arousal: parameters.stopWalkingLowArousalRate * (1 - arousal),
      };
  }
}
