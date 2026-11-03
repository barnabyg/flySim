# Evidence Pack: inactivity and sleep (phase 5)

`evidencePack.json` holds the Validation Targets for phase 5. This page summarises it.

A target counts only when its source was read in full: methods, results and figure legends. Values read off a figure say so, with their reading precision.

## Reference Fly

**Strain: Canton-S.** Adult male, 3–7 days old, housed alone in a tube with food at one end.

Why Canton-S:

- All four studies behind the counted targets used Canton-S males: Xu 2021, Zimmerman 2008, Geissmann 2019 and Cascallares 2018.
- Zimmerman 2008 scored the same Canton-S males with a beam monitor and with video. No other wild-type strain in the sources has this.
- Zimmerman 2008 also shows that wild-type strains differ in sleep, and in how far a beam monitor overestimates it. So the strain must be fixed.
- No source read gave another wild-type strain better male data.

The glossary's Reference Fly entry names Canton-S.

## Counted targets

There are 8 counted targets, all phase 5, all male, all Canton-S. Two are held out from tuning.

| id                                            | Study                      | Assay                                                               | Measure                                                          | Published (n)                                                                                  | Criterion                                                                             | Held out |
| --------------------------------------------- | -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| `xu-2021-inactivity-bouts-power-law`          | Xu 2021, Commun Biol       | Video, 25 fps; any centroid change is movement                      | Inactivity Bout CCDF exponent β, per phase, fitted over 3 s to K | Light 0.73 ± 0.04 SEM; dark 0.78 ± 0.02 SEM (153 flies; SEM over 5 experiments). Text, Fig. 3a | Mean per-fly β: light in [0.55, 0.91] over 3–200 s, dark in [0.69, 0.87] over 3–300 s | No       |
| `xu-2021-male-scored-sleep-profile`           | Xu 2021                    | Virtual midline beam from the video                                 | Scored Sleep per 30-min bin, 48 bins from ZT0                    | 48 values read off Fig. 1f (±0.7 min); light ≈ 424 min, dark ≈ 483 min (168 flies)             | Pearson r ≥ 0.9 and mean absolute difference ≤ 4 min per bin                          | No       |
| `zimmerman-2008-beam-light-phase-sleep`       | Zimmerman 2008, Sleep      | Single-beam DAMS, 30-s bins                                         | Light-phase Scored Sleep                                         | 391.2 ± 53.7 SD min (n 8 or 22). Table 2                                                       | Mean in [337.5, 444.9]                                                                | No       |
| `zimmerman-2008-beam-dark-phase-sleep`        | Zimmerman 2008             | Single-beam DAMS, 30-s bins                                         | Dark-phase Scored Sleep                                          | 603.9 ± 79.0 SD min. Table 2                                                                   | Mean in [524.9, 682.9]                                                                | No       |
| `zimmerman-2008-video-light-phase-sleep`      | Zimmerman 2008             | Video, 1 frame per 5 s; any 1-pixel change (189 µm) is movement     | Light-phase Scored Sleep                                         | 217.0 ± 92.3 SD min. Table 2                                                                   | Mean in [124.7, 309.3]                                                                | **Yes**  |
| `geissmann-2019-daily-scored-sleep-ethoscope` | Geissmann 2019, Sci Adv    | Ethoscope: max velocity per 10-s epoch; grooming counts as movement | Daily Scored Sleep                                               | 618.5 min, CI95 606.7–630.3 (485 flies). Results text                                          | Mean in [485.9, 751.1]                                                                | No       |
| `cascallares-2018-activity-bouts-exponential` | Cascallares 2018, PLoS ONE | Video, 1 Hz; ≥ 1.8 mm per s is movement; grooming doesn't count     | Activity Bout CCDF exponential tail rate                         | 0.14 /s in LD, no uncertainty (10 flies). Text, Fig. 2B                                        | Least-squares rate over 13–43 s in [0.11, 0.17]                                       | No       |
| `cascallares-2018-quiescence-power-law`       | Cascallares 2018           | As above                                                            | Inactivity Bout CCDF exponent                                    | 0.6 in LD, no uncertainty (10 flies). Text, Fig. 2A                                            | Fitted over 2–1000 s, in [0.5, 0.7]                                                   | **Yes**  |

### How the bounds were set

- **SD between flies is published** (Zimmerman) **or can be derived** (Geissmann: CI half-width ÷ 1.96 × √n = 132.6 min): the model mean must lie within mean ± 1 SD. A model fly should look like a typical real fly.
- **Only an SEM over k experiments is published** (Xu): the bound is mean ± 2 × SEM × √k. A pooled model run is compared like one more experiment.
- **No uncertainty is published** (Cascallares): the bounds are a stated judgment, about ±20%. Read the JSON before relying on them.
- **The profile:** r ≥ 0.9 because a plain 12-hour cosine already scores r = 0.88, and a 1-hour phase error drops r to 0.76.

### Why these are held out

- **Video light-phase sleep (Zimmerman).** Tune on the beam-monitor targets. Then video scoring of the same simulated flies must show the published 45% drop in daytime sleep. This tests the movement model and the assays, not a tuned number.
- **Quiescence exponent (Cascallares).** Tune bout shape on Xu only. A different lab's assay, with a 1.8 mm threshold, 1 Hz sampling and grooming not counted, must then give 0.5–0.7.

## Candidate targets (not counted)

| id                                         | Phase       | Why not counted                                                                                                                                          |
| ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `xu-2021-inactivity-bout-exponential-tail` | 5 (reserve) | K is about 177 s by day and 286 s by night (Fig. 3d). The text gives only 'around 200 s' and 'around 300 s', and the bounds are wide.                    |
| `zimmerman-2008-video-mean-sleep-bout`     | 5 (reserve) | Video sleep bouts average 13.8 ± 7.8 min by day and 20.8 ± 13.0 min by night. Held back to keep the pack at 8; use it if a bout-length target is wanted. |
| `ueno-2012-rest-bouts-power-law-dd`        | 6           | The strain is w1118, recorded in constant darkness. Density exponent α = 1.61 ± 0.08 SEM (Fig. 2d).                                                      |
| `ueno-2012-activity-bout-mean-dd`          | 6           | w1118 in constant darkness. Mean Activity Bout 11.5 ± 1.4 s SEM (Fig. 2e).                                                                               |

Leads for phases 6–7, none read in full yet:

- **Constant darkness, phase 6.** Xu 2021 Fig. 4h gives male sleep profiles in DD. Cascallares 2018 gives an Activity Bout rate of 0.16 /s in DD.
- **Sleep rebound, phase 7.** Geissmann 2019 Figs. 5–6 cover Canton-S male rebound after 12 h and 9.5 days of deprivation, but only as figures.
- **Arousal threshold, phase 6.** Vienne 2016 and Beckwith 2017 are leads. No male arousal-threshold source was read in full; Faville 2015 is females only.

## Excluded sources

| Source                                                                                           | Why excluded                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Garbe 2015, Biol Open                                                                            | Read in full. The flies are iso31, not a wild-type strain. Male values are only in bar charts and supplementary Table S2. Useful later for multi-beam DAM5.    |
| Faville 2015, Sci Rep                                                                            | Read in full. Females only (w1118, w2202).                                                                                                                     |
| Geissmann 2017, PLoS Biol                                                                        | Read in full. A methods paper with no male baseline values. Used only for the ethoscope movement definition.                                                   |
| Catterson 2010; Isaac 2010; Linford 2012; Ishimoto 2012; Bushey 2010; Wiggin 2020; Beckwith 2017 | Not read in full; only searched within the full text. The wrong strain (w1118, Oregon R, yw), the wrong sex, mutants, diet experiments, or later-phase topics. |
| Huber 2004, Sleep                                                                                | No open-access full text found.                                                                                                                                |
| Vienne 2016, Sleep                                                                               | Not read. A lead for phases 6–7.                                                                                                                               |

## The spec's unverified claims

**Xu 2021: "power law from about 3 s to 200–300 s, then an exponential tail."** _Confirmed, with caveats._

- The 3 s is the lower bound the authors chose for the fit, not a measured onset.
- The power law holds up to a per-fly latency K, about 200 s by day and 300 s by night. Beyond K, the tail is exponential by a KS test.
- The exponent is in CCDF form: β = 0.73 by day and 0.78 by night for males. That is a density exponent of about 1.7–1.8.

**Ueno 2012: "power law over about 3 decades, indistinguishable from lognormal."** _Confirmed._

- The text says the linear region spans "nearly 3 decades".
- Table 1 gives power law vs lognormal LR −1.17, p = 0.37.
- But the data pool 10 flies, the strain is w1118, and the flies were in constant darkness. It doesn't count for this phase.

**Ueno 2012: "exponential Activity Bouts."** _Corrected._

- Ueno never fits or tests an exponential.
- It only shows a power law isn't favoured over an exponential (LR 0.02, p = 0.54).
- The power law's own goodness of fit isn't rejected either (p′ = 0.23).

**Ueno 2012: "beam monitors overestimate rest."** _Confirmed, mainly through the paper Ueno cites._

- Ueno cites Zimmerman 2008 for this. It also shows that coarser bins lengthen rest bouts (Fig. 7), and that a DAM classes over 70% of time as sleep.
- Zimmerman 2008 measured it in Canton-S males. Against video, DAMS overestimates daytime sleep by 80%, nighttime by 23% and 24-h sleep by 41%. It overestimates mean sleep bout length by 702% by day.

**Cascallares 2018: "exponential Activity Bouts."** _Confirmed for the tail only._

- The CCDF is fitted by e^−0.14t in LD over about 13–43 s.
- Bouts shorter than about 10 s fall off faster than that exponential.
- The paper reports no goodness-of-fit test.

**Male siesta and consolidated night sleep.** _Confirmed_ (Xu 2021 Fig. 1f; Zimmerman 2008).

- By day, male sleep peaks at about 24–25 min per 30 min around ZT 5–7. It drops to 1–2 min at lights-off.
- By night, it plateaus at about 27–28 min per 30 min from ZT 15 to 19.5. It falls to about 11–12 min in the 2 hours before lights-on.
- Beam monitors score 391 min by day and 604 min by night.

**Daily sleep amount.** _Depends on the assay._

| Assay                                  | Canton-S male sleep per day            | Source         |
| -------------------------------------- | -------------------------------------- | -------------- |
| Single-beam DAMS                       | 995 min                                | Zimmerman 2008 |
| Virtual beam                           | ≈ 908 min, summed from figure readings | Xu 2021        |
| Frame-subtraction video                | 708 min                                | Zimmerman 2008 |
| Ethoscope, grooming counts as movement | 618.5 min                              | Geissmann 2019 |

So no single "daily sleep" number exists without naming the assay.

## Known gaps

- **Zimmerman 2008 n.** Table 1 says 8 Canton-S males. Table 4 says N = 22 for the same values. Which applies to Table 2 is unclear, so n is null.
- **Xu 2021 profile.** The sleep criterion and bin length aren't stated. The pack assumes the 5-minute rule and 1-minute bins. The virtual beam position (47.75 mm) is derived, not stated.
- **Xu 2021 pixel size.** The pixel size in mm isn't stated, and neither is whether grooming moves the centroid.
- **Geissmann 2019 ethoscope.** The velocity threshold is in relative units defined in a supplement that wasn't read. Fly age isn't stated. The text says 4 recorded days; the figure legend says 5.
- **DAMS tube bore.** It isn't stated for Zimmerman. The pack assumes 3 mm, as Ueno 2012 states for its DAM tubes.
- **Not downloaded.** Supplementary source data (Xu Supplementary Data 1, Garbe Table S2) would replace figure readings with exact values.
