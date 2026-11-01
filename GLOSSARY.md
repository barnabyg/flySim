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
