import type { LightSchedule } from "../engine";

export const SPEEDS: readonly number[] = [1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 1000];
export const INITIAL_SPEED = 60;

const PAUSE_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor"/></svg>';
const RESUME_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 2l10 6-10 6z" fill="currentColor"/></svg>';
const SPEED_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 3l6 5-6 5zM8 3l6 5-6 5z" fill="currentColor"/></svg>';

function formatClock(timeSeconds: number): string {
  const total = Math.floor(timeSeconds);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

/** Hours on a 24-hour dial, with midnight at the bottom and noon at the top. */
function dialDegrees(hours: number): number {
  return (hours / 24) * 360 + 180;
}

function formatTimeOfDay(hours: number): string {
  const totalMinutes = Math.floor(hours * 60);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}

export interface TimeControls {
  showTime(timeSeconds: number, timeOfDayHours: number): void;
}

export interface TimeControlHandlers {
  onSpeedChange(speed: number): void;
  onPausedChange(paused: boolean): void;
}

export function createTimeControls(
  container: HTMLElement,
  initialSpeed: number,
  lightSchedule: LightSchedule,
  handlers: TimeControlHandlers,
): TimeControls {
  const initialIndex = SPEEDS.indexOf(initialSpeed);
  container.innerHTML = `
    <button id="pause" type="button"></button>
    <span class="speed-icon" title="Time speed">${SPEED_ICON}</span>
    <input id="speed" type="range" min="0" max="${SPEEDS.length - 1}" step="1" value="${initialIndex}" aria-label="Time speed" />
    <output id="speed-readout">${initialSpeed}×</output>
    <span id="day-dial" role="img" aria-label="Time of day ${formatTimeOfDay(lightSchedule.lightsOnHour)}" title="Time of day"><span id="day-dial-hand"></span></span>
    <output id="time-of-day" title="Time of day">${formatTimeOfDay(lightSchedule.lightsOnHour)}</output>
    <output id="clock" title="Simulated time">${formatClock(0)}</output>`;

  const pause = container.querySelector<HTMLButtonElement>("#pause");
  const speedInput = container.querySelector<HTMLInputElement>("#speed");
  const readout = container.querySelector<HTMLOutputElement>("#speed-readout");
  const clock = container.querySelector<HTMLOutputElement>("#clock");
  const dial = container.querySelector<HTMLElement>("#day-dial");
  const hand = container.querySelector<HTMLElement>("#day-dial-hand");
  const timeOfDay = container.querySelector<HTMLOutputElement>("#time-of-day");
  if (!pause || !speedInput || !readout || !clock || !dial || !hand || !timeOfDay) {
    throw new Error("Malformed time controls");
  }

  // The dial's bright part is the schedule's day, so the hand shows the light it's under.
  const lightDegrees = lightSchedule.lightHours * 15;
  dial.style.background = `conic-gradient(from ${dialDegrees(lightSchedule.lightsOnHour)}deg, #e8d98a 0 ${lightDegrees}deg, #2a3048 ${lightDegrees}deg 360deg)`;

  let paused = false;

  function showPaused(): void {
    pause?.setAttribute("aria-label", paused ? "Resume" : "Pause");
    if (pause) {
      pause.title = paused ? "Resume" : "Pause";
      pause.innerHTML = paused ? RESUME_ICON : PAUSE_ICON;
    }
  }
  showPaused();

  pause.addEventListener("click", () => {
    paused = !paused;
    showPaused();
    handlers.onPausedChange(paused);
  });

  speedInput.addEventListener("input", () => {
    const speed = SPEEDS[Number(speedInput.value)] ?? INITIAL_SPEED;
    readout.textContent = `${speed}×`;
    handlers.onSpeedChange(speed);
  });

  return {
    showTime: (timeSeconds, timeOfDayHours) => {
      clock.textContent = formatClock(timeSeconds);
      const text = formatTimeOfDay(timeOfDayHours);
      timeOfDay.textContent = text;
      dial.setAttribute("aria-label", `Time of day ${text}`);
      hand.style.transform = `rotate(${dialDegrees(timeOfDayHours)}deg)`;
    },
  };
}
