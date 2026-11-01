const SECONDS_PER_HOUR = 3600;
const HOURS_PER_DAY = 24;

/** When the Room's overhead light is on. It stays fixed during a run. */
export interface LightSchedule {
  /** The time of day the light comes on, and so when every run starts. */
  readonly lightsOnHour: number;
  /** How long it stays on each day. The rest of the day is dark. */
  readonly lightHours: number;
}

/** A 12:12 light:dark cycle. */
export const DEFAULT_LIGHT_SCHEDULE: LightSchedule = { lightsOnHour: 6, lightHours: 12 };

export function validateLightSchedule({ lightsOnHour, lightHours }: LightSchedule): void {
  if (lightsOnHour < 0 || lightsOnHour >= HOURS_PER_DAY) {
    throw new Error(`The lights can't come on at hour ${lightsOnHour}`);
  }
  if (lightHours < 0 || lightHours > HOURS_PER_DAY) {
    throw new Error(`The lights can't stay on for ${lightHours} hours a day`);
  }
}

function hoursSinceLightsOn(timeSeconds: number): number {
  return (timeSeconds / SECONDS_PER_HOUR) % HOURS_PER_DAY;
}

export function timeOfDayHours(schedule: LightSchedule, timeSeconds: number): number {
  return (schedule.lightsOnHour + hoursSinceLightsOn(timeSeconds)) % HOURS_PER_DAY;
}

/** 1 with the light on and 0 with it off. */
export function lightLevel(schedule: LightSchedule, timeSeconds: number): number {
  return hoursSinceLightsOn(timeSeconds) < schedule.lightHours ? 1 : 0;
}
