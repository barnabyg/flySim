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

/**
 * Model values for Phases 1 to 3. They are roughly tuned so that about 10 simulated minutes
 * shows all four awake behaviours, a settled fly often stays in awake Immobility for more than
 * 5 minutes, a day shows a morning, siesta, evening and night of sleep, and a part-fed fly
 * finds food within hours. They are not validated: every relationship here is Provisional,
 * including energy use, water loss, intake and how Hunger, Thirst and odour act.
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
  /**
   * Feeding can start only on the food. Scaled by the cube of Hunger, so a fly that has just
   * fed and is still standing on the food rarely starts again.
   */
  readonly startFeedingHungerRate: number;
  /** Scaled by the fourth power of how far Hunger has fallen, so a bout ends as the fly fills. */
  readonly stopFeedingSatietyRate: number;
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
  readonly stopDrinkingSatietyRate: number;
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
  startWalkingSpontaneousRate: 0.0003,
  startWalkingArousalRate: 0.25,
  startWalkingLightRate: 0.002,
  startWalkingHungerRate: 0.03,
  startWalkingOdourRate: 0.02,
  startWalkingThirstRate: 0.03,
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
  initialHydration: 0.6,
  waterLossResting: 5e-6,
  waterLossWalking: 8e-6,
  waterLossFlying: 2e-5,
  waterLossSleeping: 3.5e-6,
  startDrinkingThirstRate: 1,
  stopDrinkingSatietyRate: 0.15,
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
  const odourRising = Math.tanh(odourChange / parameters.odourContrast);
  const humidityRising = Math.tanh(
    (senses.humidity - state.recentHumidity) / parameters.humidityContrast,
  );
  // Hunger sets how much odour matters and Thirst how much humidity does.
  return Math.exp(
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

/** From 1 for a fly with enough of both reserves down to 0 as either runs out. */
function vigour(state: InternalState, parameters: ModelParameters): number {
  const reserve = Math.min(state.energy, state.hydration);
  return Math.min(1, reserve / parameters.weaknessReserve) ** 2;
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
  const strength = vigour(state, parameters);
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
        hunger: parameters.startWalkingHungerRate * hunger ** 4,
        odour: parameters.startWalkingOdourRate * senses.odour * hunger,
        thirst: parameters.startWalkingThirstRate * thirst ** 4,
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
        hunger: parameters.walkAfterGroomingHungerRate * hunger ** 4,
        odour: parameters.walkAfterGroomingOdourRate * senses.odour * hunger,
        thirst: parameters.walkAfterGroomingThirstRate * thirst ** 4,
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
          hunger ** 3 *
          (1 - parameters.feedingThirstInhibition * thirst) *
          onFood,
      };
    case "feeding-to-immobility":
      return {
        ...NO_CONTRIBUTIONS,
        hunger: parameters.stopFeedingSatietyRate * (1 - hunger) ** 4,
        startle: parameters.stopFeedingStartleRate * startle,
      };
    case "immobility-to-drinking":
    case "walking-to-drinking":
      return {
        ...NO_CONTRIBUTIONS,
        thirst: parameters.startDrinkingThirstRate * thirst ** 3 * onWater,
      };
    case "drinking-to-immobility":
      return {
        ...NO_CONTRIBUTIONS,
        thirst: parameters.stopDrinkingSatietyRate * (1 - thirst) ** 4,
        startle: parameters.stopDrinkingStartleRate * startle,
      };
  }
}
