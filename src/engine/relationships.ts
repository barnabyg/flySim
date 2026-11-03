import type { DriverId, TransitionId } from "./model";
import type { ModelParameters } from "./parameters";

/**
 * How far each relationship in the model is measured biology. Established means a counted
 * Evidence Pack target supports it, Provisional that it is roughly tuned or plausible but not
 * validated, and Hypothesis that it is the model's own proposal, such as its answer to what ends
 * Inactivity Bouts under 5 minutes.
 */
export type RelationshipStatus = "established" | "provisional" | "hypothesis";

export const RELATIONSHIP_STATUSES: readonly RelationshipStatus[] = [
  "established",
  "provisional",
  "hypothesis",
];

export interface RelationshipLabel {
  readonly status: RelationshipStatus;
  /** What the relationship is, or what the parameter sets, in a sentence. */
  readonly description: string;
  /** For an Established label, the ids of the counted Evidence Pack targets that support it. */
  readonly evidence?: readonly string[];
}

/** How one Driver pushes one transition, and its label. */
export interface DriverRelationship extends RelationshipLabel {
  readonly transition: TransitionId;
  readonly driver: DriverId;
}

function provisional(description: string): RelationshipLabel {
  return { status: "provisional", description };
}

function hypothesis(description: string): RelationshipLabel {
  return { status: "hypothesis", description };
}

function established(description: string, evidence: readonly string[]): RelationshipLabel {
  return { status: "established", description, evidence };
}

const ENDS_SHORT_BOUTS =
  "It is the model's answer to what ends Inactivity Bouts under 5 minutes: arousal left over from activity drifts down during stillness, so the chance of moving falls the longer the fly stays still. No source measures it.";

/**
 * Each parameter's label. A tuned value is Provisional unless a counted Evidence Pack target
 * supports the value itself, and the arousal that ends short Inactivity Bouts is a Hypothesis.
 */
export const PARAMETER_LABELS: Readonly<Record<keyof ModelParameters, RelationshipLabel>> = {
  arousalTargetImmobile: hypothesis(`Where arousal settles during Immobility. ${ENDS_SHORT_BOUTS}`),
  arousalTargetGrooming: provisional("Where arousal settles while grooming."),
  arousalTargetWalking: provisional("Where arousal settles while walking."),
  arousalTargetFlying: provisional("Where arousal settles in flight."),
  arousalTargetSleeping: provisional("Where arousal settles during sleep."),
  arousalTargetFeeding: provisional("Where arousal settles while feeding."),
  arousalTargetDrinking: provisional("Where arousal settles while drinking."),
  arousalTimeConstantSeconds: hypothesis(
    `How slowly arousal drifts towards where it settles. ${ENDS_SHORT_BOUTS}`,
  ),
  arousalNoise: hypothesis(
    "Arousal's random drift, which lets a still fly move again with no new stimulus.",
  ),
  initialArousal: provisional("Arousal at the start of a run."),
  startWalkingSpontaneousRate: hypothesis(
    "A still fly's small chance of walking that no Driver explains.",
  ),
  startWalkingArousalRate: hypothesis(`How strongly arousal starts walking. ${ENDS_SHORT_BOUTS}`),
  startWalkingLightRate: provisional("How strongly light starts walking."),
  startWalkingHungerRate: provisional("How strongly Hunger starts walking."),
  startWalkingOdourRate: provisional("How strongly odour starts a hungry fly walking."),
  startWalkingThirstRate: provisional("How strongly Thirst starts walking."),
  stopWalkingSpontaneousRate: provisional("A walking fly's chance of stopping."),
  stopWalkingLowArousalRate: hypothesis("How strongly low arousal ends walking."),
  startGroomingSpontaneousRate: provisional("A still fly's chance of grooming."),
  startGroomingArousalRate: hypothesis(`How strongly arousal starts grooming. ${ENDS_SHORT_BOUTS}`),
  stopGroomingSpontaneousRate: provisional("A grooming fly's chance of stopping."),
  walkAfterGroomingSpontaneousRate: provisional("A grooming fly's chance of walking off."),
  walkAfterGroomingArousalRate: hypothesis("How strongly arousal ends grooming in a walk."),
  walkAfterGroomingHungerRate: provisional("How strongly Hunger ends grooming in a walk."),
  walkAfterGroomingOdourRate: provisional("How strongly odour ends a hungry fly's grooming."),
  walkAfterGroomingThirstRate: provisional("How strongly Thirst ends grooming in a walk."),
  takeOffFromImmobilitySpontaneousRate: provisional("A still fly's chance of flying."),
  takeOffFromImmobilityArousalRate: provisional("How strongly arousal starts a still fly flying."),
  takeOffFromWalkingSpontaneousRate: provisional("A walking fly's chance of flying."),
  takeOffFromWalkingArousalRate: provisional("How strongly arousal starts a walking fly flying."),
  landingContactRate: provisional("How quickly a flying fly lands on reaching a surface."),
  lostContactRate: provisional("How quickly feeding or drinking ends when the source goes."),
  sleepPressureRiseTimeConstantSeconds: provisional("How quickly Sleep Pressure rises awake."),
  sleepPressureFallTimeConstantSeconds: provisional("How quickly Sleep Pressure falls asleep."),
  initialSleepPressure: provisional("Sleep Pressure at the start of a run."),
  fallAsleepSleepPressureRate: provisional("How strongly Sleep Pressure brings on sleep."),
  wakeSpontaneousRate: provisional("A sleeping fly's chance of waking that no Driver explains."),
  wakeLowSleepPressureRate: provisional("How strongly discharged Sleep Pressure wakes the fly."),
  sleepDepthAtOnset: provisional("Sleep Depth on falling asleep."),
  sleepDepthBaseTarget: provisional("Where Sleep Depth settles with no Sleep Pressure."),
  sleepDepthSleepPressureGain: provisional("How much Sleep Pressure deepens sleep."),
  sleepDepthTimeConstantSeconds: provisional("How slowly Sleep Depth settles."),
  sleepDepthNoise: provisional("Sleep Depth's random drift."),
  wakeSleepDepthReduction: provisional("How much deep sleep holds back waking."),
  circadianPeriodHours: provisional("The Circadian Clock's free-running day."),
  clockEntrainmentRate: provisional("How strongly light draws the clock to the Light Schedule."),
  fallAsleepCircadianRate: provisional("How strongly the clock's sleep gate brings on sleep."),
  siestaGateStrength: provisional("How open the clock's sleep gate is at the midday siesta."),
  wakeCircadianRate: provisional("How strongly the clock wakes the fly when its gate is shut."),
  wakeLightRate: provisional("How strongly light wakes the fly."),
  startleTimeConstantSeconds: provisional("How quickly a Startle fades."),
  startWalkingStartleRate: provisional("How strongly a Startle starts walking."),
  walkAfterGroomingStartleRate: provisional("How strongly a Startle ends grooming."),
  takeOffFromImmobilityStartleRate: provisional(
    "How strongly a Startle starts a still fly flying.",
  ),
  takeOffFromWalkingStartleRate: provisional("How strongly a Startle starts a walking fly flying."),
  wakeStartleRate: provisional("How strongly a Startle wakes the fly."),
  walkingSpeedMetresPerSecond: provisional("How fast the fly walks."),
  walkingTurnNoise: provisional("How much a walking fly wanders."),
  flightSpeedMetresPerSecond: provisional("How fast the fly flies."),
  initialEnergy: provisional("How full the Energy Reserve starts."),
  energyUseResting: provisional("Energy used awake and still."),
  energyUseWalking: provisional("Energy used walking."),
  energyUseFlying: provisional("Energy used flying."),
  energyUseSleeping: provisional("Energy used asleep."),
  startFeedingHungerRate: provisional("How strongly Hunger starts feeding on the food."),
  stopFeedingLowHungerRate: provisional("How strongly falling Hunger ends feeding."),
  stopFeedingStartleRate: provisional("How strongly a Startle ends feeding."),
  feedingIntake: provisional("How fast feeding fills the Energy Reserve."),
  initialHydration: provisional("How full the Hydration Reserve starts."),
  waterLossResting: provisional("Water lost awake and still."),
  waterLossWalking: provisional("Water lost walking."),
  waterLossFlying: provisional("Water lost flying."),
  waterLossSleeping: provisional("Water lost asleep."),
  startDrinkingThirstRate: provisional("How strongly Thirst starts drinking on the water."),
  stopDrinkingLowThirstRate: provisional("How strongly falling Thirst ends drinking."),
  stopDrinkingStartleRate: provisional("How strongly a Startle ends drinking."),
  drinkingIntake: provisional("How fast drinking fills the Hydration Reserve."),
  odourRangeMetres: provisional("How far the Odour Field reaches."),
  odourAdaptationSeconds: provisional("How quickly sensed odour catches up."),
  odourDetectionFloor: provisional("The weakest odour the fly compares against."),
  odourContrast: provisional("The change in odour that steers the fly fully."),
  odourSteeringGain: provisional("How strongly a hungry fly steers by odour."),
  humidityRangeMetres: provisional("How far the Humidity Field reaches."),
  globalHumidity: provisional("The Room's humidity away from the water."),
  humidityRise: provisional("How far above the Room's humidity the air is at the water."),
  humidityAdaptationSeconds: provisional("How quickly sensed humidity catches up."),
  humidityContrast: provisional("The change in humidity that steers the fly fully."),
  humiditySteeringGain: provisional("How strongly a thirsty fly steers by humidity."),
  startWalkingHumidityRate: provisional("How strongly damp air starts a thirsty fly walking."),
  walkAfterGroomingHumidityRate: provisional(
    "How strongly damp air ends a thirsty fly's grooming.",
  ),
  feedingThirstInhibition: provisional("How much Thirst holds back feeding."),
  weaknessReserve: provisional("How low a reserve falls before the fly weakens."),
};

/** The male's siesta and consolidated night sleep, timed by the day. */
const SLEEP_PROFILE = ["xu-2021-male-scored-sleep-profile"];

function driver(
  transition: TransitionId,
  driverId: DriverId,
  label: RelationshipLabel,
): DriverRelationship {
  return { transition, driver: driverId, ...label };
}

/**
 * Each way a Driver pushes a transition, and its label. The relationship can be Established while
 * the parameters that size it stay Provisional, as a source may show that a push exists without
 * saying how strong it is.
 */
export const DRIVER_RELATIONSHIPS: readonly DriverRelationship[] = [
  driver(
    "immobility-to-walking",
    "spontaneous",
    hypothesis("A still fly sometimes walks off for no reason a Driver gives."),
  ),
  driver(
    "immobility-to-walking",
    "arousal",
    hypothesis(`Arousal starts a still fly walking. ${ENDS_SHORT_BOUTS}`),
  ),
  driver("immobility-to-walking", "light", provisional("Light starts a still fly walking.")),
  driver("immobility-to-walking", "startle", provisional("A Startle sends a still fly walking.")),
  driver("immobility-to-walking", "hunger", provisional("Hunger starts a still fly walking.")),
  driver(
    "immobility-to-walking",
    "odour",
    provisional("Odour starts a hungry fly walking, more so the hungrier it is."),
  ),
  driver("immobility-to-walking", "thirst", provisional("Thirst starts a still fly walking.")),
  driver(
    "immobility-to-walking",
    "humidity",
    provisional("Damp air starts a thirsty fly walking, more so the thirstier it is."),
  ),
  driver(
    "immobility-to-grooming",
    "spontaneous",
    provisional("A still fly grooms now and then, with no contamination to prompt it."),
  ),
  driver(
    "immobility-to-grooming",
    "arousal",
    hypothesis(`Arousal starts grooming. ${ENDS_SHORT_BOUTS}`),
  ),
  driver("grooming-to-immobility", "spontaneous", provisional("Grooming ends at a steady rate.")),
  driver(
    "grooming-to-walking",
    "spontaneous",
    provisional("A grooming fly sometimes walks off for no reason a Driver gives."),
  ),
  driver("grooming-to-walking", "arousal", hypothesis("Arousal ends grooming in a walk.")),
  driver("grooming-to-walking", "startle", provisional("A Startle ends grooming in a walk.")),
  driver("grooming-to-walking", "hunger", provisional("Hunger ends grooming in a walk.")),
  driver("grooming-to-walking", "odour", provisional("Odour ends a hungry fly's grooming.")),
  driver("grooming-to-walking", "thirst", provisional("Thirst ends grooming in a walk.")),
  driver("grooming-to-walking", "humidity", provisional("Damp air ends a thirsty fly's grooming.")),
  driver(
    "immobility-to-flying",
    "spontaneous",
    provisional("A still fly sometimes takes off for no reason a Driver gives."),
  ),
  driver("immobility-to-flying", "arousal", provisional("Arousal starts a still fly flying.")),
  driver("immobility-to-flying", "startle", provisional("A Startle makes a still fly take off.")),
  driver("walking-to-immobility", "spontaneous", provisional("Walking ends at a steady rate.")),
  driver(
    "walking-to-immobility",
    "arousal",
    hypothesis("Low arousal ends walking, so a calming fly makes shorter walks."),
  ),
  driver(
    "walking-to-flying",
    "spontaneous",
    provisional("A walking fly sometimes takes off for no reason a Driver gives."),
  ),
  driver("walking-to-flying", "arousal", provisional("Arousal starts a walking fly flying.")),
  driver("walking-to-flying", "startle", provisional("A Startle makes a walking fly take off.")),
  driver(
    "flying-to-immobility",
    "contact",
    provisional("A flying fly lands as soon as it reaches a surface."),
  ),
  driver(
    "immobility-to-sleeping",
    "sleepPressure",
    provisional("Sleep Pressure, built up while awake, brings on sleep in a settled fly."),
  ),
  driver(
    "immobility-to-sleeping",
    "circadian",
    established(
      "The clock opens the way to sleep at the midday siesta and through the night, and holds it shut around dawn and dusk.",
      SLEEP_PROFILE,
    ),
  ),
  driver(
    "sleeping-to-immobility",
    "spontaneous",
    provisional("A sleeping fly sometimes wakes for no reason a Driver gives."),
  ),
  driver("sleeping-to-immobility", "light", provisional("Light wakes a sleeping fly.")),
  driver(
    "sleeping-to-immobility",
    "sleepPressure",
    provisional("A fly whose sleep has discharged its Sleep Pressure wakes."),
  ),
  driver(
    "sleeping-to-immobility",
    "circadian",
    established(
      "The clock wakes the fly around dawn and dusk, when its sleep gate is shut.",
      SLEEP_PROFILE,
    ),
  ),
  driver(
    "sleeping-to-immobility",
    "startle",
    provisional("A Startle wakes a sleeping fly, less the deeper it sleeps."),
  ),
  driver(
    "immobility-to-feeding",
    "hunger",
    provisional("Hunger starts feeding on the food, held back by Thirst."),
  ),
  driver(
    "walking-to-feeding",
    "hunger",
    provisional("Hunger starts feeding on the food, held back by Thirst."),
  ),
  driver("feeding-to-immobility", "hunger", provisional("Falling Hunger ends feeding.")),
  driver("feeding-to-immobility", "startle", provisional("A Startle ends feeding.")),
  driver(
    "feeding-to-immobility",
    "contact",
    provisional("Losing touch with the food ends feeding."),
  ),
  driver("immobility-to-drinking", "thirst", provisional("Thirst starts drinking on the water.")),
  driver("walking-to-drinking", "thirst", provisional("Thirst starts drinking on the water.")),
  driver("drinking-to-immobility", "thirst", provisional("Falling Thirst ends drinking.")),
  driver("drinking-to-immobility", "startle", provisional("A Startle ends drinking.")),
  driver(
    "drinking-to-immobility",
    "contact",
    provisional("Losing touch with the water ends drinking."),
  ),
];
