import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import {
  DEFAULT_ROOM,
  DEFAULT_SAMPLE_INTERVAL_SECONDS,
  DEFAULT_STEPS_PER_SECOND,
  MAX_STEPS_PER_SECOND,
  MIN_STEPS_PER_SECOND,
  validateSetupOptions,
  type FloorPlace,
  type SetupOptions,
} from "../engine";

/** What a batch runs: the same setup for every seed, as the viewer's URL would give it. */
export interface BatchOptions {
  readonly seeds: readonly number[];
  readonly durationSeconds: number;
  readonly outputDirectory: string;
  readonly sampleIntervalSeconds: number;
  /** The setup each seed runs with. */
  readonly setup: Omit<SetupOptions, "seed">;
  /** How many seeds run at once, each in its own process. */
  readonly jobs: number;
}

export const USAGE = `Runs many seeded Simulation Runs without the viewer, and writes their exports.

  npm run batch -- [options]

Options:
  --seeds <seeds>          How many seeds from 1 (10), a range (5-9, or 42-42 for one) or a list
                           (3,7,42). Default 10.
  --duration <time>        How long each run lasts in simulated time, in s, m, h or d. Default 1d.
  --out <directory>        Where to write the files. Default batch-output.
  --sample-interval <s>    Seconds between exported samples, a whole number. Default ${DEFAULT_SAMPLE_INTERVAL_SECONDS}.
  --width <m>              The Room's width, as the viewer's URL has it. Default ${DEFAULT_ROOM.widthMetres}.
  --depth <m>              The Room's depth. Default ${DEFAULT_ROOM.depthMetres}.
  --height <m>             The Room's height. Default ${DEFAULT_ROOM.heightMetres}.
  --food <x,y>             Where the food starts, in metres from the west and south walls.
  --water <x,y>            Where the water starts.
  --energy <level>         How full the Energy Reserve starts, from 0.01 to 1.
  --hydration <level>      How full the Hydration Reserve starts, from 0.01 to 1.
  --light-hours <hours>    The starting hours of light from lights-on at 06:00, from 0 to 24.
  --steps-per-second <n>   The run's step size, in whole steps per simulated second, from
                           ${MIN_STEPS_PER_SECOND} to ${MAX_STEPS_PER_SECOND}. Default ${DEFAULT_STEPS_PER_SECOND}.
  --jobs <count>           How many seeds run at once. Default: one per core.
  --help                   Shows this.
`;

/** Thrown for a command the batch can't run, with a message saying why. */
export class BatchOptionsError extends Error {
  override readonly name = "BatchOptionsError";
}

function fail(message: string): never {
  throw new BatchOptionsError(message);
}

function numberOption(name: string, text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value))
    fail(`--${name} must be a number, not "${text}"`);
  return value;
}

function wholeNumber(name: string, text: string): number {
  const value = Number(text);
  if (text.trim() === "" || !Number.isInteger(value)) {
    fail(`--${name} needs whole numbers, not "${text}"`);
  }
  return value;
}

/** A count from 1, a range or a list. */
function seedsFrom(text: string): number[] {
  const range = /^(-?\d+)-(-?\d+)$/.exec(text);
  if (range) {
    const [first, last] = [
      wholeNumber("seeds", range[1] ?? ""),
      wholeNumber("seeds", range[2] ?? ""),
    ];
    if (last < first) fail(`--seeds ${text} is a range that runs backwards`);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }
  if (text.includes(",")) {
    const seeds = text.split(",").map((each) => wholeNumber("seeds", each));
    if (new Set(seeds).size !== seeds.length) fail(`--seeds ${text} has a seed more than once`);
    return seeds;
  }
  const count = wholeNumber("seeds", text);
  if (count < 1) fail(`--seeds needs at least one seed, not ${count}`);
  return Array.from({ length: count }, (_, index) => index + 1);
}

const UNIT_SECONDS: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3600, d: 86_400 };

function durationFrom(text: string): number {
  const match = /^(\d+(?:\.\d+)?)([smhd])$/.exec(text);
  const seconds = match ? Number(match[1]) * (UNIT_SECONDS[match[2] ?? ""] ?? NaN) : NaN;
  if (!(seconds > 0)) {
    fail(
      `--duration must be a simulated time with a unit, such as 90s, 30m, 6h or 2d, not "${text}"`,
    );
  }
  return seconds;
}

function placeFrom(name: string, text: string | undefined): FloorPlace | undefined {
  if (text === undefined) return undefined;
  const [x, y, ...rest] = text.split(",").map((each) => numberOption(name, each));
  if (x === undefined || y === undefined || rest.length > 0) {
    fail(`--${name} must be a place written x,y, not "${text}"`);
  }
  return { x, y };
}

/**
 * Reads a batch command's arguments, and checks every choice before any run starts. Returns
 * undefined when the command only asks for help.
 */
export function parseBatchOptions(args: readonly string[]): BatchOptions | undefined {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      strict: true,
      options: {
        seeds: { type: "string", default: "10" },
        duration: { type: "string", default: "1d" },
        out: { type: "string", default: "batch-output" },
        "sample-interval": { type: "string", default: String(DEFAULT_SAMPLE_INTERVAL_SECONDS) },
        width: { type: "string" },
        depth: { type: "string" },
        height: { type: "string" },
        food: { type: "string" },
        water: { type: "string" },
        energy: { type: "string" },
        hydration: { type: "string" },
        "light-hours": { type: "string" },
        "steps-per-second": { type: "string" },
        jobs: { type: "string" },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (values.help) return undefined;

  const sampleIntervalSeconds = wholeNumber("sample-interval", values["sample-interval"]);
  if (sampleIntervalSeconds < 1) fail("--sample-interval must be at least 1 second");
  const jobs =
    values.jobs === undefined ? availableParallelism() : wholeNumber("jobs", values.jobs);
  if (jobs < 1) fail("--jobs must be at least 1");

  const food = placeFrom("food", values.food);
  const water = placeFrom("water", values.water);
  const energy = numberOption("energy", values.energy);
  const hydration = numberOption("hydration", values.hydration);
  const lightHours = numberOption("light-hours", values["light-hours"]);
  const stepsPerSecond = numberOption("steps-per-second", values["steps-per-second"]);
  const setup: Omit<SetupOptions, "seed"> = {
    room: {
      widthMetres: numberOption("width", values.width) ?? DEFAULT_ROOM.widthMetres,
      depthMetres: numberOption("depth", values.depth) ?? DEFAULT_ROOM.depthMetres,
      heightMetres: numberOption("height", values.height) ?? DEFAULT_ROOM.heightMetres,
    },
    ...(food && { food }),
    ...(water && { water }),
    ...(energy !== undefined && { energy }),
    ...(hydration !== undefined && { hydration }),
    ...(lightHours !== undefined && { lightHours }),
    ...(stepsPerSecond !== undefined && { stepsPerSecond }),
  };
  const seeds = seedsFrom(values.seeds);
  try {
    for (const seed of seeds) validateSetupOptions({ ...setup, seed });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  return {
    seeds,
    durationSeconds: durationFrom(values.duration),
    outputDirectory: values.out,
    sampleIntervalSeconds,
    setup,
    jobs,
  };
}
