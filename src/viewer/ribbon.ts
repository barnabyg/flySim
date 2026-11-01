import { BEHAVIOURS, type Behaviour, type FiredTransition, type RunSample } from "../engine";
import { BEHAVIOUR_COLOURS } from "./palette";

/** The ribbon always spans this many seconds of real time at the current speed. */
const WINDOW_WALL_SECONDS = 60;

interface BehaviourChange {
  readonly timeSeconds: number;
  readonly behaviour: Behaviour;
}

export interface Ribbon {
  update(sample: RunSample, fired: readonly FiredTransition[]): void;
  setSpeed(speed: number): void;
  draw(): void;
}

/**
 * A strip of behaviour over time. Each pixel column is stacked by the share of its
 * time spent in each behaviour, so bouts too short to draw at high speeds are still
 * shown in the right proportions rather than being dropped or blended.
 */
export function createRibbon(canvas: HTMLCanvasElement): Ribbon {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context for the ribbon");

  const changes: BehaviourChange[] = [];
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
    const { width, height } = canvas;
    const windowSeconds = WINDOW_WALL_SECONDS * speed;
    const windowStart = now - windowSeconds;
    const secondsPerColumn = windowSeconds / width;
    canvas.dataset["windowStart"] = String(windowStart);
    canvas.dataset["windowEnd"] = String(now);
    ctx.clearRect(0, 0, width, height);

    let changeIndex = 0;
    for (let x = 0; x < width; x++) {
      const columnStart = windowStart + x * secondsPerColumn;
      const columnEnd = columnStart + secondsPerColumn;
      if (columnEnd <= 0) continue;

      const shares = new Map<Behaviour, number>();
      // Each change is in effect until the next, so scan on from the last column's position.
      while ((changes[changeIndex + 1]?.timeSeconds ?? Infinity) <= columnStart) changeIndex += 1;
      for (let i = changeIndex; i < changes.length; i++) {
        const change = changes[i];
        if (!change || change.timeSeconds >= columnEnd) break;
        const spanEnd = Math.min(columnEnd, changes[i + 1]?.timeSeconds ?? now);
        const overlap = spanEnd - Math.max(columnStart, change.timeSeconds);
        if (overlap > 0) {
          shares.set(change.behaviour, (shares.get(change.behaviour) ?? 0) + overlap);
        }
      }

      const total = [...shares.values()].reduce((sum, share) => sum + share, 0);
      if (total === 0) continue;
      // Rounds to whole pixels, so each behaviour keeps its exact colour.
      let top = 0;
      let cumulative = 0;
      for (const behaviour of BEHAVIOURS) {
        cumulative += shares.get(behaviour) ?? 0;
        const bottom = Math.round((cumulative / total) * height);
        if (bottom > top) {
          ctx.fillStyle = BEHAVIOUR_COLOURS[behaviour];
          ctx.fillRect(x, top, 1, bottom - top);
          top = bottom;
        }
      }
    }
  }

  return {
    update: (sample, fired) => {
      if (changes.length === 0) {
        changes.push({ timeSeconds: 0, behaviour: fired[0]?.from ?? sample.behaviour });
      }
      for (const { timeSeconds, to } of fired) changes.push({ timeSeconds, behaviour: to });
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
