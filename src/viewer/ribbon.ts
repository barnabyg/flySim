import {
  BEHAVIOURS,
  type Behaviour,
  type FiredTransition,
  type Intervention,
  type RunSample,
} from "../engine";
import {
  BEHAVIOUR_COLOURS,
  DAY_COLOUR,
  NIGHT_COLOUR,
  SLEEP_DEPTH_COLOURS,
  sleepDepthColour,
} from "./palette";

/** The ribbon always spans this many seconds of real time at the current speed. */
const WINDOW_WALL_SECONDS = 60;

/** The order colours stack in, with sleep shaded from light to deep. */
const STACK: readonly string[] = BEHAVIOURS.flatMap((behaviour) =>
  behaviour === "sleeping" ? SLEEP_DEPTH_COLOURS : [BEHAVIOUR_COLOURS[behaviour]],
);

function colourOf(behaviour: Behaviour, sleepDepth: number | null): string {
  return behaviour === "sleeping"
    ? sleepDepthColour(sleepDepth ?? 0)
    : BEHAVIOUR_COLOURS[behaviour];
}

/** A thin strip along the ribbon's foot shows the Room's light, so a day can be read at a glance. */
const LIGHT_STRIP_PIXELS = 2;
const MARK_COLOUR = "#ffffff";
const MARK_PIXELS = 2;

interface LightChange {
  readonly timeSeconds: number;
  readonly lightLevel: number;
}

interface ColourChange {
  readonly timeSeconds: number;
  readonly colour: string;
}

export interface Ribbon {
  update(
    sample: RunSample,
    fired: readonly FiredTransition[],
    interventions: readonly Intervention[],
  ): void;
  setSpeed(speed: number): void;
  draw(): void;
}

/**
 * A strip of behaviour over time. Each pixel column is stacked by the share of its
 * time spent in each behaviour, so bouts too short to draw at high speeds are still
 * shown in the right proportions rather than being dropped or blended. Sleep is
 * shaded by Sleep Depth, which arrives with each frame.
 */
/** A run's Interventions are timed in its steps, of which it takes this many a second. */
export function createRibbon(canvas: HTMLCanvasElement, stepsPerSecond: number): Ribbon {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context for the ribbon");

  const changes: ColourChange[] = [];
  const lightChanges: LightChange[] = [];
  const markTimes: number[] = [];
  let now = 0;
  let speed = 1;

  function resizeToDisplay(): void {
    const width = Math.round(canvas.clientWidth * devicePixelRatio);
    const height = Math.round(canvas.clientHeight * devicePixelRatio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  function draw(ctx: CanvasRenderingContext2D): void {
    resizeToDisplay();
    const { width } = canvas;
    const stripHeight = Math.round(LIGHT_STRIP_PIXELS * devicePixelRatio);
    const height = canvas.height - stripHeight;
    const windowSeconds = WINDOW_WALL_SECONDS * speed;
    const windowStart = now - windowSeconds;
    const secondsPerColumn = windowSeconds / width;
    canvas.dataset["windowStart"] = String(windowStart);
    canvas.dataset["windowEnd"] = String(now);
    ctx.clearRect(0, 0, width, canvas.height);

    let changeIndex = 0;
    for (let x = 0; x < width; x++) {
      const columnStart = windowStart + x * secondsPerColumn;
      const columnEnd = columnStart + secondsPerColumn;
      if (columnEnd <= 0) continue;

      const shares = new Map<string, number>();
      // Each change is in effect until the next, so scan on from the last column's position.
      while ((changes[changeIndex + 1]?.timeSeconds ?? Infinity) <= columnStart) changeIndex += 1;
      for (let i = changeIndex; i < changes.length; i++) {
        const change = changes[i];
        if (!change || change.timeSeconds >= columnEnd) break;
        const spanEnd = Math.min(columnEnd, changes[i + 1]?.timeSeconds ?? now);
        const overlap = spanEnd - Math.max(columnStart, change.timeSeconds);
        if (overlap > 0) {
          shares.set(change.colour, (shares.get(change.colour) ?? 0) + overlap);
        }
      }

      const total = [...shares.values()].reduce((sum, share) => sum + share, 0);
      if (total === 0) continue;
      // Rounds to whole pixels, so each band keeps its exact colour.
      let top = 0;
      let cumulative = 0;
      for (const colour of STACK) {
        cumulative += shares.get(colour) ?? 0;
        const bottom = Math.round((cumulative / total) * height);
        if (bottom > top) {
          ctx.fillStyle = colour;
          ctx.fillRect(x, top, 1, bottom - top);
          top = bottom;
        }
      }
    }

    lightChanges.forEach((change, index) => {
      const start = (change.timeSeconds - windowStart) / secondsPerColumn;
      const end = ((lightChanges[index + 1]?.timeSeconds ?? now) - windowStart) / secondsPerColumn;
      if (end <= 0) return;
      ctx.fillStyle = change.lightLevel > 0 ? DAY_COLOUR : NIGHT_COLOUR;
      ctx.fillRect(Math.max(0, start), height, end - Math.max(0, start), stripHeight);
    });

    const markWidth = Math.round(MARK_PIXELS * devicePixelRatio);
    const visibleMarks = markTimes.filter((time) => time >= windowStart);
    canvas.dataset["marks"] = String(visibleMarks.length);
    ctx.fillStyle = MARK_COLOUR;
    for (const time of visibleMarks) {
      // A mark made just now stays on the canvas rather than falling off its end.
      const x = Math.min(width - markWidth, Math.round((time - windowStart) / secondsPerColumn));
      ctx.fillRect(x, 0, markWidth, canvas.height);
    }
  }

  return {
    update: (sample, fired, interventions) => {
      // A schedule change shows in the light strip, so only a Disturb needs a mark.
      for (const { step, type } of interventions) {
        if (type === "disturb") markTimes.push(step / stepsPerSecond);
      }
      if (changes.length === 0) {
        changes.push({
          timeSeconds: 0,
          colour: colourOf(fired[0]?.from ?? sample.behaviour, sample.sleepDepth),
        });
      }
      for (const { timeSeconds, to } of fired) {
        changes.push({ timeSeconds, colour: colourOf(to, null) });
      }
      const colour = colourOf(sample.behaviour, sample.sleepDepth);
      if (sample.behaviour === "sleeping" && changes.at(-1)?.colour !== colour) {
        changes.push({ timeSeconds: sample.timeSeconds, colour });
      }
      if (lightChanges.at(-1)?.lightLevel !== sample.lightLevel) {
        lightChanges.push({ timeSeconds: sample.timeSeconds, lightLevel: sample.lightLevel });
      }
      now = sample.timeSeconds;
    },
    setSpeed: (newSpeed) => {
      speed = newSpeed;
    },
    draw: () => {
      draw(context);
    },
  };
}
