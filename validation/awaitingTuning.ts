/**
 * Targets the model doesn't meet yet, before it is tuned against the Evidence Pack (#73), with
 * what it gives instead. Each still runs, and its test is expected to fail, so one that starts to
 * match fails the suite until it is taken off this list and becomes a test that must pass.
 */
export const AWAITING_TUNING: ReadonlyMap<string, string> = new Map<string, string>([]);
