/**
 * Comparisons the current model doesn't meet, by the id their result has in the report, with what
 * model 0.7.0 gives. Each still runs, and its test is expected to fail, so one that starts to
 * match fails the suite until it is taken off this list and becomes a test that must pass.
 * Held-out targets are never on it, as they are reported and never tuned against.
 *
 * Tuning against the tuning pack (#73) found parameter values that meet all of them but
 * Zimmerman 2008's dark-phase beam sleep, but they were not adopted. They kept the fly's walking
 * hazard high at rest, so it rarely stayed awake and still for 5 minutes, which is the behaviour
 * the project set out to explain. Rebound after lost sleep weakened, and darkness no longer cut
 * walking at once. Both held-out targets failed with them, which says the same: real flies keep
 * still and awake far more than that model did. So the current model can't meet these targets
 * and keep its long awake Immobility:
 *
 * - The Inactivity Bouts' power law (Xu 2021) needs many short pauses ended quickly, so the
 *   hazard of walking must stay high soon after the fly stops. Arousal sets that hazard by its
 *   square, and is the same arousal that must fall low for long awake Immobility, so the model
 *   can have one or the other. Cascallares 2018's Activity Bout tail rate needs short walks,
 *   which pull the same way.
 * - The daily Scored Sleep profile (Xu 2021) needs a sharp dusk and a gradual fall in sleep
 *   before dawn. The clock's sleep gate, a square root by night and a fourth power by day, can't
 *   give them with any parameter values, which a search of 3000 parameter sets showed: r reached
 *   0.79 at best. Squaring both peaks reached r 0.93.
 * - Real beam monitors score about 380 min a day more sleep than an ethoscope (Zimmerman 2008,
 *   Geissmann 2019), from awake flies that keep still or groom in place for minutes. The model's
 *   beam monitor scores almost the same as its ethoscope, so the ethoscope's daily sleep can't
 *   fall to its target without the beam's light-phase sleep falling below its own.
 *
 * What they need: a walking hazard that falls far lower once the fly has settled than between
 * the walks of a bout of activity, such as a slow Driver of activity that tells a bout of
 * activity from rest, or a steeper dependence on arousal, and a sleep gate whose siesta and night
 * peaks have the same shape. Then a settled, awake fly could keep still or groom for minutes, as
 * the beam monitor and video targets say it does, while a fly between walks resumes quickly.
 * Values can be tried with `npm run tune`, which never runs a held-out target.
 */
export const AWAITING_TUNING: ReadonlyMap<string, string> = new Map<string, string>([
  ["xu-2021-inactivity-bouts-power-law:light", "CCDF exponent 0.12, against 0.55 to 0.91"],
  ["xu-2021-inactivity-bouts-power-law:dark", "CCDF exponent 0.21, against 0.69 to 0.87"],
  ["xu-2021-male-scored-sleep-profile", "r = 0.56 and a mean difference of 6.2 min a bin"],
  ["zimmerman-2008-beam-light-phase-sleep", "325 min, against 337.5 to 444.9"],
  ["geissmann-2019-daily-scored-sleep-ethoscope", "909 min, against 485.9 to 751.1"],
  ["cascallares-2018-activity-bouts-exponential", "a tail rate of 0.072 /s, against 0.11 to 0.17"],
]);
