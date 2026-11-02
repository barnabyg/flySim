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

**Light Schedule**:
When the Room's overhead light is on each day. A Simulation Run's setup gives the schedule it starts with, and an Intervention can change it during the run, including to always on or always off. A default run has 12 hours of light and 12 of dark and starts at lights-on.
_Avoid_: Photoperiod, day length setting

**Intervention**:
A timed change the experimenter makes to a Simulation Run, such as a Disturb or a new Light Schedule, applied at a step boundary and stored in the Run Record.
_Avoid_: Event, input

**Disturb**:
The Intervention that jolts the fly, like a tap on its tube, and creates a Startle.
_Avoid_: Poke, tap, stimulus

### Runs

**Simulation Run**:
One seeded run of the model from a setup of Room, Light Schedule, model parameters and Interventions. The same setup and seed always give the same run, at any time speed.
_Avoid_: Simulation, session, episode

**Run Record**:
What a Simulation Run stores: its setup and seed, a sample of the fly's state each simulated second, every fired transition and every Intervention. It is enough to check and replay the run.
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
