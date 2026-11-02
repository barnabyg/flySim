# Fly Behaviour Simulator

A personal visual simulator for watching a single adult fruit fly live in a room and seeing why it starts, continues and stops each behaviour, including why it stays motionless.

## Language

### The fly

**Reference Fly**:
The single fly the model represents: an adult male *Drosophila melanogaster* of a named wild-type strain, 3–7 days old and housed alone.
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
A Driver that rises as the Hydration Reserve falls. It raises the hazards that start drinking, and its fall is what ends a bout of Drinking.
_Avoid_: Dehydration (when the Driver is meant)

**Drinking**:
The behaviour of taking in water through the extended proboscis. It can start only while the fly touches the Water Source, and ends as Thirst falls, not after a set time.
_Avoid_: Watering, hydrating

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
_Avoid_: Arena, sandbox, chamber

**Food Source**:
A patch of food on the Room's floor, at a place a Simulation Run's setup gives. It never runs out, and the fly touches it only by standing on it.
_Avoid_: Food item, bait, feeder

**Odour Field**:
A steady, simplified spread of odour from the Food Source, with no airflow or turbulence, strongest at the food and gone beyond a set range in any direction. The fly senses it only where it is, and a hungry fly steers up it by comparing what it senses now with what it sensed a moment ago, so it can wander past food it can't smell. It is Provisional.
_Avoid_: Scent map, smell gradient, plume (which implies airflow)

**Water Source**:
A patch of water on the Room's floor, at a place a Simulation Run's setup gives, apart from the Food Source by default. It never runs out, and the fly touches it only by standing on it.
_Avoid_: Water dish, drinker

**Light Schedule**:
When the Room's overhead light is on each day. A Simulation Run's setup gives the schedule it starts with, and an Intervention can change it during the run, including to always on or always off. A default run has 12 hours of light and 12 of dark and starts at lights-on.
_Avoid_: Photoperiod, day length setting

**Intervention**:
A timed change the experimenter makes to a Simulation Run, such as a Disturb or a new Light Schedule, applied at a step boundary and stored in the Run Record.
_Avoid_: Event, input

**Disturb**:
The Intervention that jolts the fly, as a lab might by knocking its tube, and creates a Startle.
_Avoid_: Poke, tap, stimulus

### Runs

**Simulation Run**:
One seeded run of the model from a setup of Room, Light Schedule, model parameters and Interventions. The same setup and seed always give the same run, at any time speed. A test can also choose which random stream draws Trigger Levels.
_Avoid_: Simulation, session, episode

**Run Record**:
What a Simulation Run stores: its seed and setup, a sample of the fly's state each simulated second, every fired transition and every Intervention. A long run in the viewer keeps only its latest samples.
_Avoid_: Log, history, trace

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

### Validation

**Virtual Assay**:
A published study's measurement method and setup, applied to a simulated fly so the result can be compared with that study's.
_Avoid_: Simulated experiment, metric

**Validation Target**:
A sourced, published finding the model must reproduce, tied to a specific study, assay and fly sex.
_Avoid_: Benchmark, expected result

**Evidence Pack**:
The curated set of Validation Targets, including at least one held out from parameter tuning.
_Avoid_: Test data, references
