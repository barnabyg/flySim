# Behaviour switches through competing hazards driven by slow hidden state

Each behaviour or Vigilance State change has a Transition Hazard that depends on the fly's internal state and what it senses, and the first event to fire causes the transition. We chose this over the [proposal](../proposal.md)'s per-tick softmax because published recordings report heavy-tailed Inactivity Bouts ([Xu 2021](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC7979771/fullTextXML), [Ueno 2012](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0032007)), while a memoryless choice repeated each tick gives exponential bouts and hysteresis does not create a long tail. Slow hidden variables, such as background arousal drifting down during stillness, let a falling chance of moving emerge from the model, and each transition has a concrete explanation in the hazards that were competing when it fired.

## Considered Options

- **Softmax per tick with hysteresis:** rejected because it produces the wrong bout shape and its bout lengths depend on the time step unless carefully corrected.
- **Hazard as an explicit function of time in bout, such as a fitted β/t:** rejected as a mechanism because it encodes the tail rather than explaining it, which makes it a statistical form of the "rest timer" the project set out to avoid. It is kept as a fitted descriptive baseline to compare against.

## Consequences

- The model may fail to reproduce the tail without tuning, and tuning could hide the same assumption inside a slow variable. Both are checked through the Evidence Pack, not assumed away.
- Pooling different flies or states can itself produce a falling hazard, so distributions are compared per simulated fly as well as pooled.
- The first validation stage requires non-exponential Inactivity Bouts and near-exponential Activity Bouts, across seeds and time-step sizes.
- Each hazard accumulates towards a randomly drawn Trigger Level, an exact equivalent of competing hazards that does not imply a biological threshold.
