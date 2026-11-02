const SECONDS_PER_HOUR = 3600;
const HOURS_PER_DAY = 24;

/** When the Room's overhead light is on. The experimenter can change it during a run. */
export interface LightSchedule {
  /** The time of day the light comes on. A run starts at its first schedule's lights-on. */
  readonly lightsOnHour: number;
  /** How long it stays on each day, from 0 for always off to 24 for always on. */
  readonly lightHours: number;
}

/** A 12:12 light:dark cycle. */
export const DEFAULT_LIGHT_SCHEDULE: LightSchedule = { lightsOnHour: 6, lightHours: 12 };

export function validateLightSchedule({ lightsOnHour, lightHours }: LightSchedule): void {
  if (!(lightsOnHour >= 0 && lightsOnHour < HOURS_PER_DAY)) {
    throw new Error(`The lights can't come on at hour ${lightsOnHour}`);
  }
  if (!(lightHours >= 0 && lightHours <= HOURS_PER_DAY)) {
    throw new Error(`The lights can't stay on for ${lightHours} hours a day`);
  }
}

/** The Room's clock, which runs on from the run's start whatever the schedule does. */
export function timeOfDayHours(startHour: number, timeSeconds: number): number {
  return (startHour + timeSeconds / SECONDS_PER_HOUR) % HOURS_PER_DAY;
}

/** 1 with the light on and 0 with it off. */
export function lightLevel(schedule: LightSchedule, timeOfDay: number): number {
  const sinceLightsOn = (timeOfDay - schedule.lightsOnHour + HOURS_PER_DAY) % HOURS_PER_DAY;
  return sinceLightsOn < schedule.lightHours ? 1 : 0;
}
