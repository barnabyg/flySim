/**
 * Model values. Phases 1 to 3 tuned them roughly, so that about 10 simulated minutes shows all
 * four awake behaviours, a settled fly often stays in awake Immobility for more than 5 minutes, a
 * day shows a morning, siesta, evening and night of sleep, and a part-fed fly finds food within
 * hours. Phase 5 tried tuning them against the Evidence Pack's tuning targets (#73), but the
 * values that met them gave up long awake Immobility, so these remain, and
 * validation/awaitingTuning.ts says which targets they miss and why. No value is validated:
 * each is Provisional, apart from those of the arousal that ends short Inactivity Bouts, which
 * are a Hypothesis. PARAMETER_LABELS in relationships.ts labels each.
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
  /** Arousal relaxes towards this level while drinking. */
  readonly arousalTargetDrinking: number;
  readonly arousalTimeConstantSeconds: number;
  /** Size of arousal's random drift, per square root of a second. */
  readonly arousalNoise: number;
  readonly initialArousal: number;
  /** Restlessness relaxes towards 1 at this pace while the fly walks or flies. */
  readonly restlessnessRiseTimeConstantSeconds: number;
  /** Restlessness relaxes towards 0 at this pace otherwise, more slowly than it rises. */
  readonly restlessnessFallTimeConstantSeconds: number;
  readonly initialRestlessness: number;
  /** Rates are per second. */
  readonly startWalkingSpontaneousRate: number;
  readonly startWalkingArousalRate: number;
  /** Light the fly senses acts at once, unlike its slow effect on the clock. */
  readonly startWalkingLightRate: number;
  /**
   * Scaled by the fourth power of Hunger, so a part-fed fly still settles for minutes at a
   * time and a hungry one is restless.
   */
  readonly startWalkingHungerRate: number;
  /** Scaled by the odour sensed and by Hunger, which sets how much the odour matters. */
  readonly startWalkingOdourRate: number;
  /** Scaled by the fourth power of Thirst, as Hunger is, so a parched fly searches. */
  readonly startWalkingThirstRate: number;
  /**
   * Scaled by Restlessness, so a fly between walks resumes sooner than one that has settled. It
   * and walkAfterGroomingRestlessnessRate are 0 for now, as tuning them cost the Room its rebound
   * and its response to darkness (#81); validation/restlessnessCandidate.json has those values.
   */
  readonly startWalkingRestlessnessRate: number;
  readonly stopWalkingSpontaneousRate: number;
  readonly stopWalkingLowArousalRate: number;
  /** Grooming has no contamination model, so nothing about dirt drives these. */
  readonly startGroomingSpontaneousRate: number;
  readonly startGroomingArousalRate: number;
  readonly stopGroomingSpontaneousRate: number;
  readonly walkAfterGroomingSpontaneousRate: number;
  readonly walkAfterGroomingArousalRate: number;
  readonly walkAfterGroomingHungerRate: number;
  readonly walkAfterGroomingOdourRate: number;
  readonly walkAfterGroomingThirstRate: number;
  readonly walkAfterGroomingRestlessnessRate: number;
  readonly takeOffFromImmobilitySpontaneousRate: number;
  readonly takeOffFromImmobilityArousalRate: number;
  readonly takeOffFromWalkingSpontaneousRate: number;
  readonly takeOffFromWalkingArousalRate: number;
  /** Contact ends a flight almost at once, so a fly doesn't linger at a surface. */
  readonly landingContactRate: number;
  /** Losing touch with the food or water, as when it is taken away, ends a bout almost at once. */
  readonly lostContactRate: number;
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
  /**
   * Feeding can start only on the food. Scaled by the cube of Hunger, so a fly that has just
   * fed and is still standing on the food rarely starts again.
   */
  readonly startFeedingHungerRate: number;
  /** Scaled by the fourth power of how far Hunger has fallen, so a bout ends as the fly fills. */
  readonly stopFeedingLowHungerRate: number;
  readonly stopFeedingStartleRate: number;
  /** The share of a full energy reserve taken in per second of feeding. */
  readonly feedingIntake: number;
  /** Part-hydrated, so that a default run is likely to drink within its first hours. */
  readonly initialHydration: number;
  /** Shares of a full hydration reserve lost per second, by what the fly is doing. */
  readonly waterLossResting: number;
  readonly waterLossWalking: number;
  readonly waterLossFlying: number;
  readonly waterLossSleeping: number;
  /** Drinking can start only on the water. Scaled by the cube of Thirst, as feeding is. */
  readonly startDrinkingThirstRate: number;
  /** Scaled by the fourth power of how far Thirst has fallen, so a bout ends as the fly fills. */
  readonly stopDrinkingLowThirstRate: number;
  readonly stopDrinkingStartleRate: number;
  /** The share of a full hydration reserve taken in per second of drinking. */
  readonly drinkingIntake: number;
  /** How far the Odour Field reaches from the food, in any direction. 0 switches it off. */
  readonly odourRangeMetres: number;
  /** How quickly the recently sensed odour catches up with what the fly senses now. */
  readonly odourAdaptationSeconds: number;
  /** The weakest odour the fly compares against, which keeps a faint odour from swamping it. */
  readonly odourDetectionFloor: number;
  /** The relative change in odour, over the adaptation time, that steers the fly fully. */
  readonly odourContrast: number;
  /**
   * How strongly a fully hungry fly steers by odour. Rising odour makes it turn less and
   * falling odour makes it turn more, so it keeps on up the field and turns back down it.
   */
  readonly odourSteeringGain: number;
  /** How far the Humidity Field reaches from the water, in any direction. 0 switches it off. */
  readonly humidityRangeMetres: number;
  /** The Room's humidity away from the water, which is the same everywhere and at all times. */
  readonly globalHumidity: number;
  /** How far above the Room's humidity the air is at the water. */
  readonly humidityRise: number;
  /** How quickly the recently sensed humidity catches up with what the fly senses now. */
  readonly humidityAdaptationSeconds: number;
  /** The change in humidity, over the adaptation time, that steers the fly fully. */
  readonly humidityContrast: number;
  /** How strongly a fully thirsty fly steers by humidity, in the same way as by odour. */
  readonly humiditySteeringGain: number;
  /** Scaled by how far the air is above the Room's humidity, and by Thirst. */
  readonly startWalkingHumidityRate: number;
  readonly walkAfterGroomingHumidityRate: number;
  /** The share of Hunger's push to start feeding that full Thirst takes away. */
  readonly feedingThirstInhibition: number;
  /**
   * Below this much of either reserve the fly weakens, starting effortful behaviour less and
   * less often, by the square of how far the reserve has fallen towards empty.
   */
  readonly weaknessReserve: number;
}

export const DEFAULT_PARAMETERS: ModelParameters = {
  arousalTargetImmobile: 0.05,
  arousalTargetGrooming: 0.3,
  arousalTargetWalking: 0.75,
  arousalTargetFlying: 0.9,
  arousalTargetSleeping: 0.02,
  arousalTargetFeeding: 0.3,
  arousalTargetDrinking: 0.3,
  arousalTimeConstantSeconds: 120,
  arousalNoise: 0.015,
  initialArousal: 0.5,
  restlessnessRiseTimeConstantSeconds: 60,
  restlessnessFallTimeConstantSeconds: 600,
  initialRestlessness: 0,
  startWalkingSpontaneousRate: 0.0003,
  startWalkingArousalRate: 0.25,
  startWalkingLightRate: 0.002,
  startWalkingHungerRate: 0.03,
  startWalkingOdourRate: 0.02,
  startWalkingThirstRate: 0.03,
  startWalkingRestlessnessRate: 0,
  stopWalkingSpontaneousRate: 0.02,
  stopWalkingLowArousalRate: 0.06,
  startGroomingSpontaneousRate: 0.001,
  startGroomingArousalRate: 0.04,
  stopGroomingSpontaneousRate: 0.04,
  walkAfterGroomingSpontaneousRate: 0.005,
  walkAfterGroomingArousalRate: 0.03,
  walkAfterGroomingHungerRate: 0.06,
  walkAfterGroomingOdourRate: 0.02,
  walkAfterGroomingThirstRate: 0.06,
  walkAfterGroomingRestlessnessRate: 0,
  takeOffFromImmobilitySpontaneousRate: 0.002,
  takeOffFromImmobilityArousalRate: 0.02,
  takeOffFromWalkingSpontaneousRate: 0.018,
  takeOffFromWalkingArousalRate: 0.06,
  landingContactRate: 100,
  lostContactRate: 100,
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
  stopFeedingLowHungerRate: 0.15,
  stopFeedingStartleRate: 2,
  feedingIntake: 0.004,
  initialHydration: 0.6,
  waterLossResting: 5e-6,
  waterLossWalking: 8e-6,
  waterLossFlying: 2e-5,
  waterLossSleeping: 3.5e-6,
  startDrinkingThirstRate: 1,
  stopDrinkingLowThirstRate: 0.15,
  stopDrinkingStartleRate: 2,
  drinkingIntake: 0.006,
  odourRangeMetres: 0.3,
  odourAdaptationSeconds: 1,
  odourDetectionFloor: 0.01,
  odourContrast: 0.05,
  odourSteeringGain: 2,
  humidityRangeMetres: 0.3,
  globalHumidity: 0.4,
  humidityRise: 0.4,
  humidityAdaptationSeconds: 1,
  humidityContrast: 0.01,
  humiditySteeringGain: 2,
  startWalkingHumidityRate: 0.02,
  walkAfterGroomingHumidityRate: 0.02,
  feedingThirstInhibition: 0.8,
  weaknessReserve: 0.15,
};
