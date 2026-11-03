/**
 * Comparisons the model doesn't meet yet, before it is tuned against the Evidence Pack (#73), by
 * the id their result has in the report, with what the untuned model gave on 2026-11-03. Each still
 * runs, and its test is expected to fail, so one that starts to match fails the suite until it is
 * taken off this list and becomes a test that must pass. Held-out targets are never on it, as
 * they are reported and never tuned against.
 */
export const AWAITING_TUNING: ReadonlyMap<string, string> = new Map<string, string>([
  ["xu-2021-inactivity-bouts-power-law:light", "CCDF exponent 0.13, against 0.55 to 0.91"],
  ["xu-2021-inactivity-bouts-power-law:dark", "CCDF exponent 0.23, against 0.69 to 0.87"],
  ["xu-2021-male-scored-sleep-profile", "r = 0.56 and a mean difference of 6.0 min a bin"],
  ["zimmerman-2008-beam-light-phase-sleep", "325 min, against 337.5 to 444.9"],
  ["geissmann-2019-daily-scored-sleep-ethoscope", "902 min, against 485.9 to 751.1"],
  ["cascallares-2018-activity-bouts-exponential", "a tail rate of 0.072 /s, against 0.11 to 0.17"],
]);
