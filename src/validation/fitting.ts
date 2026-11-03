/** What fitting distributions to bout durations needs, shared by the bout-shape test and the baseline. */

/** The value in [low, high] at which a function with one peak there is highest, by golden section. */
export function maximise(f: (x: number) => number, low: number, high: number): number {
  const golden = (Math.sqrt(5) - 1) / 2;
  let [a, b] = [low, high];
  let c = b - golden * (b - a);
  let d = a + golden * (b - a);
  let [fc, fd] = [f(c), f(d)];
  for (let i = 0; i < 80 && b - a > 1e-7; i++) {
    if (fc < fd) {
      [a, c, fc] = [c, d, fd];
      d = a + golden * (b - a);
      fd = f(d);
    } else {
      [b, d, fd] = [d, c, fc];
      c = b - golden * (b - a);
      fc = f(c);
    }
  }
  return (a + b) / 2;
}

/** Durations spaced evenly on a log scale, from low to high. */
export function logSpaced(low: number, high: number, points: number): number[] {
  return Array.from({ length: points }, (_, index) =>
    points === 1 || high <= low ? low : low * (high / low) ** (index / (points - 1)),
  );
}

/**
 * The durations at least xmin long, grouped by value with how many there are, as a scored record
 * repeats the same few values. Each is measured from the given origin, xmin or 0.
 */
export function groupDurations(
  durations: readonly number[],
  xmin: number,
  origin: number,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const each of durations) {
    if (each < xmin) continue;
    // Rounded so that durations of the same number of bins group together.
    const value = Math.round((each - origin) * 1e6) / 1e6;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** How many durations a grouping holds. */
export function groupedCount(counts: ReadonlyMap<number, number>): number {
  let n = 0;
  for (const count of counts.values()) n += count;
  return n;
}
