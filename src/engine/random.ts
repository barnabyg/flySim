import { cos, log } from "./exactMath";

/** A seeded stream of random numbers: the engine's only source of randomness. */
export interface RandomStream {
  /** Uniform on [0, 1). */
  uniform(): number;
  /** Exponential with mean 1. */
  exponential(): number;
  /** Normal with mean 0 and standard deviation 1. */
  normal(): number;
}

/** Hashes a seed and stream number into one of a generator's starting words. */
function splitMix32(value: number): number {
  let z = (value + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * Creates an independent sfc32 stream. Separate streams mean that drawing more
 * from one, such as for a Trigger Level, doesn't shift the others.
 */
export function createRandomStream(seed: number, stream: number): RandomStream {
  let a = splitMix32(seed);
  let b = splitMix32(a ^ stream);
  let c = splitMix32(b);
  let d = 1;

  function uniform(): number {
    const result = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + result) | 0;
    return (result >>> 0) / 4294967296;
  }

  for (let i = 0; i < 12; i++) uniform();

  return {
    uniform,
    exponential: () => -log(1 - uniform()),
    normal: () => Math.sqrt(-2 * log(1 - uniform())) * cos(2 * Math.PI * uniform()),
  };
}
