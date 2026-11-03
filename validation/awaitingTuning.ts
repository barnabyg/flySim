/**
 * Comparisons the current model can't meet, by the id their result has in the report, with what
 * model 0.8.0 gives and why. Each still runs, and its test is expected to fail, so one that starts
 * to match fails the suite until it is taken off this list and becomes a test that must pass.
 * Held-out targets are never on it, as they are reported and never tuned against.
 *
 * Dark-phase beam sleep (Zimmerman 2008) is short by about 90 min, while the Xu 2021 profile and
 * the ethoscope's daily sleep (Geissmann 2019) pass. All three can't pass together with model
 * 0.8.0, as tuning found (#73):
 *
 * - A beam monitor scores 995 min a day (Zimmerman 2008) and an ethoscope 618 (Geissmann 2019), so
 *   a real fly spends a few hundred minutes a day awake in stretches of 5 minutes or more without
 *   crossing a beam, grooming or moving a little. The model scores only 100 to 130 min a day more by beam than by ethoscope,
 *   as its awake fly rarely keeps still for 5 minutes. The hazard that starts it walking, which
 *   arousal sets by its square, stays high enough at rest to end most awake Immobility within a
 *   few minutes. Making it lower at rest, through a lower resting arousal or less arousal noise,
 *   also lowers it between the walks of a bout of activity, which spoils the Inactivity Bouts'
 *   power law (Xu 2021).
 * - So more beam sleep by night would need more true sleep by night, which the ethoscope's daily
 *   sleep allows only by taking it from the day, and the day's beam sleep (Zimmerman 2008, light)
 *   is already near its lower bound. Xu 2021's night, 483 min by its virtual beam, is also well
 *   below Zimmerman's 604, and the profile follows Xu.
 *
 * What it would need: a walking hazard that falls far lower once the fly has settled than between
 * walks, such as one that rises more steeply than the square of arousal, or a slow Driver of
 * activity that tells a bout of activity from rest. Then a settled, awake fly could groom in place
 * for many minutes without walking, which a beam monitor scores as sleep and an ethoscope doesn't.
 */
export const AWAITING_TUNING: ReadonlyMap<string, string> = new Map<string, string>([
  ["zimmerman-2008-beam-dark-phase-sleep", "432 min, against 524.9 to 682.9"],
]);
