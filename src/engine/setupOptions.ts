import { DEFAULT_LIGHT_SCHEDULE } from "./lightSchedule";
import type { RoomSetup } from "./movement";
import { DEFAULT_PARAMETERS } from "./parameters";
import type { FloorPlace } from "./roomContents";
import type { SimulationSetup } from "./simulationRun";

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
  };
}
