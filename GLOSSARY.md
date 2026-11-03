# Fly Behaviour Simulator

A personal visual simulator for watching a single adult fruit fly live in a room and seeing why it starts, continues and stops each behaviour, including why it stays motionless.

## Language

### The fly

**Reference Fly**:
The single fly the model represents: an adult male *Drosophila melanogaster* of the wild-type strain Canton-S, 3–7 days old and housed alone. Canton-S has the best matching data in the Evidence Pack, which records why.
_Avoid_: The fly in the sink, generic fly

**Vigilance State**:
The fly's true condition in the model, either awake or asleep, which a real-world observer cannot read directly.
_Avoid_: Behavioural state, rest, awake-rest, quiescence

**Sleep Depth**:
How deeply a sleeping fly is asleep, which sets how hard it is to arouse and how likely it is to wake.
_Avoid_: Sleep stage, sleep intensity

**Sleep Pressure**:
A slow state variable that rises while the fly is awake and falls while it sleeps, pushing it towards sleep. It is not a rest timer.
_Avoid_: Tiredness, sleep debt

**Circadian Clock**:
The fly's internal clock, which runs by itself and shapes sleep over the day. Light the fly senses draws it gradually towards the Light Schedule over days.
_Avoid_: Time of day (when the internal reading is meant)

**Startle**:
A Driver created by a Disturb that fades within seconds and pushes the fly to act, with less effect the deeper it sleeps.
_Avoid_: Escape, shock

**Energy Reserve**:
The fly's store of energy, from empty to full. It falls with what the fly does, faster in walking and flight and slower in sleep, and rises only while it feeds.
_Avoid_: Nutrition, food level, satiety

**Hunger**:
A Driver that rises as the Energy Reserve falls. It raises the hazards that start walking and feeding, and its fall is what ends a bout of Feeding.
_Avoid_: Appetite, starvation (when the state is meant)

**Feeding**:
The behaviour of taking in food through the extended proboscis. It can start only while the fly touches the Food Source, and ends as Hunger falls, not after a set time.
_Avoid_: Eating, foraging (when the behaviour itself is meant)

**Hydration Reserve**:
The fly's store of water, from empty to full. It falls all the time, faster in walking and flight and slower in sleep, and rises only while it drinks.
_Avoid_: Water level, moisture

**Thirst**:
A Driver that rises as the Hydration Reserve falls. It raises the hazards that start drinking, holds back feeding, and sets how strongly the fly follows the Humidity Field. Its fall is what ends a bout of Drinking.
_Avoid_: Dehydration (when the Driver is meant)

**Drinking**:
The behaviour of taking in water through the extended proboscis. It can start only while the fly touches the Water Source, and ends as Thirst falls, not after a set time.
_Avoid_: Watering, hydrating

**Weakness**:
How a fly low on either reserve starts walking, grooming and flight less and less often, through smaller pushes from every Driver rather than a rule of its own.
_Avoid_: Fatigue, tiredness (which suggest Sleep Pressure)

**Death**:
The end of a Simulation Run when a reserve runs out, by starvation or by desiccation, from running out of water. The Run Record marks when and why, and the run advances no further. Survival times are Provisional and not validated.
_Avoid_: Game over, failure

**Immobility**:
The fly's true lack of any body movement, as known by the model. A grooming fly is not immobile.
_Avoid_: Stillness, standing still, rest

**Transition Hazard**:
The instantaneous rate at which a particular change of behaviour or Vigilance State occurs, given the fly's current internal state and what it senses.
_Avoid_: Propensity, score, utility

**Driver**:
An internal or sensed influence, such as sleep pressure, hunger or a stimulus, that raises or lowers a Transition Hazard.
_Avoid_: Factor, input, motivation

**Trigger Level**:
The randomly drawn point at which a pending transition fires, which is how chance enters each transition.
_Avoid_: Threshold, cutoff

### The world

**Room**:
The box-shaped world the user watches, containing the fly and features such as food, water and light sources.
_Avoid_: Arena, sandbox, chamber (which is a study's)

**Chamber**:
A study's own small box, such as a 65 × 5 × 5 mm activity-monitor tube, that a Virtual Assay runs the fly in instead of the Room, with food and water where the study puts them. A tube's food plug provides both at one end, and the fly touches it from any surface close to it. A chamber can make flight impossible, so no take-off is ever available. The viewer shows only the Room.
_Avoid_: Arena, tube (when any chamber is meant), Room

**Food Source**:
A patch of food on the Room's floor, at a place a Simulation Run's setup gives. It never runs out, and the fly touches it only by standing on it.
_Avoid_: Food item, bait, feeder

**Odour Field**:
A steady, simplified spread of odour from the Food Source, with no airflow or turbulence, strongest at the food and gone beyond a set range in any direction. The fly senses it only where it is, and a hungry fly steers up it by comparing what it senses now with what it sensed a moment ago, so it can wander past food it can't smell. It is Provisional.
_Avoid_: Scent map, smell gradient, plume (which implies airflow)

**Water Source**:
A patch of water on the Room's floor, at a place a Simulation Run's setup gives, apart from the Food Source by default. It never runs out, and the fly touches it only by standing on it.
_Avoid_: Water dish, drinker

**Humidity Field**:
A steady, simplified rise in humidity around the Water Source above the Room's own constant humidity, gone beyond a set range in any direction. The fly senses it only where it is, and a thirsty fly steers up it as a hungry one does up the Odour Field, while a hydrated one barely does. It is Provisional.
_Avoid_: Moisture map, water gradient

**Light Schedule**:
When the Room's overhead light is on each day. A Simulation Run's setup gives the schedule it starts with, and an Intervention can change it during the run, including to always on or always off. A default run has 12 hours of light and 12 of dark and starts at lights-on.
_Avoid_: Photoperiod, day length setting

**Intervention**:
A timed change the experimenter makes to a Simulation Run, such as a Disturb, a new Light Schedule, or moving, removing or restoring the Food or Water Source, applied at a step boundary and stored in the Run Record. A moved source takes its field with it, and the fly learns of the move only through its senses.
_Avoid_: Event, input

**Removing a Source**:
The Intervention that takes the Food or Water Source out of the Room, field and all, until restoring it puts it back where it was. Without it, the matching reserve keeps falling.
_Avoid_: Deleting, hiding (the source is gone for the fly, not just from view)

**Disturb**:
The Intervention that jolts the fly, as a lab might by knocking its tube, and creates a Startle.
_Avoid_: Poke, tap, stimulus

### Runs

**Simulation Run**:
One seeded run of the model from a setup of Room, Light Schedule, model parameters, step size and Interventions. The same setup and seed always give the same run, at any time speed, in the viewer in any browser and in a Batch. The step size is how many fixed steps the run takes per simulated second, 50 by default. Rates, time constants and noise act per simulated second, so another step size changes a run only by chance. A test can also choose which random stream draws Trigger Levels.
_Avoid_: Simulation, session, episode

**Replay**:
Starting a Simulation Run again from its beginning with the same seed and setup and every Intervention made in it, each at its original step, which gives the same run at any time speed. Interventions made during a replay add to those it repeats. A restart, by contrast, repeats the setup without any Interventions.
_Avoid_: Rerun, playback (which suggests showing a recording rather than running the model again)

**Run Record**:
What a Simulation Run stores: its seed and setup, including which random stream draws Trigger Levels, a sample of the fly's state each simulated second, every fired transition, every Intervention and the step it has reached. A long run in the viewer keeps only its latest samples.
_Avoid_: Log, history, trace

**Export**:
A Run Record saved as a gzipped file, tagged with the model version, the record format version, the seed, the full model parameters and the starting setup. Its samples are thinned to one every so many simulated seconds, but its fired transitions and Interventions never are, and the file alone reproduces the run.
_Avoid_: Dump, save file

**Record Format Version**:
The version of an Export's layout. It is a compatibility contract: every later version of the simulator reads files written at any released version, or comes with a proposed migration. A file from another model version may still not reproduce its run.
_Avoid_: File version, schema version

**Batch**:
Many Simulation Runs of the same setup, one per seed, run without the viewer for a set simulated time or until the fly dies. It writes each run's Export, tables combining every run, and a manifest of what was run.
_Avoid_: Sweep, experiment (which suggests varying the setup)

### Observations

**Inactivity Bout**:
A period without movement as scored by the assay in use, whatever the fly's Vigilance State. A fly grooming in place may or may not count, depending on the assay.
_Avoid_: Rest, resting, stationary period

**Activity Bout**:
A period of movement, as scored by the assay in use, between two Inactivity Bouts.
_Avoid_: Active phase

**Scored Sleep**:
An Inactivity Bout of 5 minutes or longer, classified as sleep from the movement record alone, as a lab would classify it.
_Avoid_: Sleep (when the observed measure is meant)

**Scoring Disagreement**:
How often a Virtual Assay's Scored Sleep disagrees with the fly's true Vigilance State, in both directions: awake Immobility scored as sleep, as a share of Scored Sleep, and true sleep not scored as sleep, because it was shorter than 5 minutes or broken by movement the instrument saw, as a share of true sleep. It is also counted as bouts, awake stretches of 5 minutes or more scored as sleep and sleep bouts missed entirely, and broken down by time of day. It measures the 5-minute rule, not the model, so it is never a Validation Target, and it is the only place the Vigilance State is set beside an assay's scoring.
_Avoid_: Scoring error, false sleep rate

### Validation

**Virtual Assay**:
A published study's measurement method and setup, applied to a simulated fly so the result can be compared with that study's. It runs the fly in the study's Chamber, records only what the study's instrument could, such as a beam monitor's crossings or a camera's frames, and scores Inactivity Bouts, Activity Bouts and Scored Sleep from that observation alone, never from the Vigilance State. Whether grooming in place counts as movement depends on the instrument.
_Avoid_: Simulated experiment, metric

**Validation Target**:
A sourced, published finding the model must reproduce, tied to a specific study, assay and fly sex.
_Avoid_: Benchmark, expected result

**Evidence Pack**:
The curated set of Validation Targets, including at least one held out from parameter tuning. Every counted target's source was read in full, and each published value records where in it it comes from.
_Avoid_: Test data, references

**Established**:
The label for a model relationship that a counted Evidence Pack target supports, which it cites. The parameters that size an Established relationship can still be Provisional, as a source may show that a push exists without saying how strong it is.
_Avoid_: Validated, proven

**Provisional**:
The label for a model relationship or parameter that is roughly tuned or plausible but not validated. Every relationship is Provisional until the Evidence Pack supports it, and a tuned value stays Provisional unless a target supports the value itself.
_Avoid_: Assumed, default

**Hypothesis**:
The label for a model relationship that is the model's own proposal and that no source measures, such as its answer to what ends Inactivity Bouts under 5 minutes: background arousal left over from activity, drifting down during stillness.
_Avoid_: Guess, speculation
