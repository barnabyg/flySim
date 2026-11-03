import { DEFAULT_LIGHT_SCHEDULE } from "./lightSchedule";
import type { RoomSetup } from "./movement";
import { DEFAULT_PARAMETERS } from "./parameters";
import { clockOf } from "./physiology";
import { SOURCE_KINDS, validateFloorPlace, type FloorPlace } from "./roomContents";
import type { SimulationSetup } from "./simulationRun";

/** The smallest and largest a Room can be in each direction, which leaves the fly room to move. */
export const MIN_ROOM_METRES = 0.1;
export const MAX_ROOM_METRES = 5;

/** A reserve can't start empty, as the fly would be dead before the run began. */
export const MIN_STARTING_RESERVE = 0.01;

/**
 * The choices the experimenter has over a run's setup, in the viewer's URL or a batch's
 * command, so both turn the same choices into the same Simulation Run.
 */
export interface SetupOptions {
  readonly seed: number;
  readonly room: RoomSetup;
  /** Where the food starts, if not at the default place. */
  readonly food?: FloorPlace;
  /** Where the water starts, if not at the default place. */
  readonly water?: FloorPlace;
  /** How full the Energy Reserve starts, if not at the default. */
  readonly energy?: number;
  /** How full the Hydration Reserve starts, if not at the default. */
  readonly hydration?: number;
  /** The starting hours of light, if not the default. Lights-on stays at its default. */
  readonly lightHours?: number;
  /** How many steps the run takes per simulated second, if not the default. */
  readonly stepsPerSecond?: number;
}

/** Throws a message saying what is wrong with any choice outside what a run allows. */
export function validateSetupOptions(options: SetupOptions): void {
  if (!Number.isInteger(options.seed)) {
    throw new Error(`A seed must be a whole number, not ${options.seed}`);
  }
  const { widthMetres, depthMetres, heightMetres } = options.room;
  for (const [name, size] of [
    ["width", widthMetres],
    ["depth", depthMetres],
    ["height", heightMetres],
  ] as const) {
    if (!(size >= MIN_ROOM_METRES && size <= MAX_ROOM_METRES)) {
      throw new Error(
        `The Room's ${name} must be from ${MIN_ROOM_METRES} to ${MAX_ROOM_METRES} m, not ${size}, so that the fly fits and can be seen`,
      );
    }
  }
  for (const kind of SOURCE_KINDS) {
    const place = options[kind];
    if (place) validateFloorPlace(options.room, place);
  }
  for (const reserve of ["energy", "hydration"] as const) {
    const level = options[reserve];
    if (level !== undefined && !(level >= MIN_STARTING_RESERVE && level <= 1)) {
      throw new Error(
        `The ${reserve} reserve must start from ${MIN_STARTING_RESERVE} to 1, not ${level}`,
      );
    }
  }
  if (options.stepsPerSecond !== undefined) clockOf(options.stepsPerSecond);
  const { lightHours } = options;
  if (lightHours !== undefined && !(lightHours >= 0 && lightHours <= 24)) {
    throw new Error(`The light can be on from 0 to 24 hours a day, not ${lightHours}`);
  }
}

export function setupFromOptions(options: SetupOptions): SimulationSetup {
  return {
    seed: options.seed,
    room: options.room,
    parameters: {
      ...DEFAULT_PARAMETERS,
      initialEnergy: options.energy ?? DEFAULT_PARAMETERS.initialEnergy,
      initialHydration: options.hydration ?? DEFAULT_PARAMETERS.initialHydration,
    },
    lightSchedule: {
      ...DEFAULT_LIGHT_SCHEDULE,
      lightHours: options.lightHours ?? DEFAULT_LIGHT_SCHEDULE.lightHours,
    },
    ...(options.food && { food: options.food }),
    ...(options.water && { water: options.water }),
    ...(options.stepsPerSecond !== undefined && { stepsPerSecond: options.stepsPerSecond }),
  };
}
