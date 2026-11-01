# Fly Behaviour Simulator
## Project proposal — behavioural ecology sandbox

**Status:** Concept proposal  
**Initial reference species:** Adult *Drosophila melanogaster* (fruit fly)  
**Product type:** Interactive, experiment-driven simulation  
**Core question:** What makes a fly begin, continue, stop or resume an activity when its environment and internal needs change?

## 1. Executive summary

Build an interactive sandbox in which a virtual fly lives autonomously in a configurable environment. The fly will not be controlled by a language model or a reconstruction of its neurons. Instead, a transparent **behavioural model**, built from scratch, will combine experimentally supported biological drivers with clearly labelled hypotheses. Its behaviour will emerge from changing internal states, limited sensory information, competing motivations and a degree of stochasticity.

Users can place food, water, shelter, light sources, air currents and other features into an arena; vary temperature, humidity and day–night cycles; and watch how the fly responds. An inspection panel will show the fly’s physiological state, what it can currently sense, why particular behaviours are becoming more or less likely, and the sequence of events leading to each transition.

**The central experiment is inactivity.** If a well-fed, hydrated fly sits motionless for several minutes, what keeps it there, and what eventually makes it move? The simulation should be capable of generating stationary periods **without imposing an arbitrary “rest for N seconds” script**, and of explaining the mechanism behind their beginning and end.

The purpose is to explore plausible behavioural explanations—not to claim that the system is a biologically exact digital fly.

## 2. Goals and success criteria

### Goals

1. Produce believable, autonomous fly behaviour in response to its internal state and local environment.
2. Model **awake inactivity**, **sleep**, **exploration**, **walking**, **flight**, **feeding**, **drinking** and **escape** as distinct behaviours.
3. Support experiments that isolate or combine influences: hunger, thirst, circadian time, temperature, humidity, sensory stimuli and risk.
4. Make every behavioural transition investigable, including cases where no obvious external event occurred.
5. Make models and parameters replaceable as better evidence or alternative hypotheses become available.
6. Reproduce selected qualitative and, where data allow, quantitative findings from fruit-fly research.

### Success criteria

- A fly runs independently for a complete simulated day without user input.
- Its decisions use only simulated internal signals and information available to its senses, **not privileged knowledge of hidden objects or global arena state**.
- Food deprivation generally raises food-seeking activity; access to food can reduce it again.
- Water deprivation can alter attraction to humidity and prompt water seeking; drinking reverses this tendency.
- A light–dark cycle changes the distribution of activity and sleep; darkness does not automatically equate to sleep.
- Mild perturbations and urgent threats have distinguishable effects on inactive or sleeping flies.
- Repeating a run with the same starting conditions, parameters, event sequence and random seed reproduces the same results.
- The interface can explain a transition with a concise causal trace rather than a post-hoc invented story.

These are **model acceptance tests**, not claims that any individual virtual trajectory exactly matches a living fly.

## 3. Scientific approach and boundaries

The first model will focus on a single adult *D. melanogaster*, because its feeding, thirst, sleep and circadian behaviour are relatively well studied. The kitchen-sink insect that inspired this project may belong to another species, so the simulation must not implicitly claim to model that specific insect. Other species should be possible later through separate parameter sets and, where necessary, different behavioural mechanisms.

Use three evidence labels throughout the model:

- **Established:** A behavioural relationship repeatedly supported by experimental observation, e.g. deprivation changes food or water seeking.
- **Provisional:** A plausible implementation of a known relationship for which exact functional form or parameter values are uncertain.
- **Hypothesis:** A proposed mechanism or behaviour introduced specifically to investigate a question, e.g. how background neural variability contributes to spontaneous activity.

Each behavioural driver should include a citation or explanatory note, evidence label, adjustable parameters and observable predictions. Do not invent biological precision: initially use dimensionless internal variables with documented meanings and plausible ranges, while retaining physical units for environmental quantities where practical.

This is a **phenomenological agent-based model**: it reproduces candidate causes and observable outcomes without simulating individual neurons. Success requires comparison with biology, not simply lifelike animation.

## 4. Fly model: internal state and drives

The fly maintains a continuous state, updated as simulated time advances.

| System | Example variables | Likely behavioural influence | Initial priority |
|---|---|---|---|
| Energy and nutrition | Energy reserve, recent intake, hunger drive | Food seeking, feeding, exploration, locomotor changes | MVP |
| Hydration | Water balance, thirst drive | Water seeking, humidity preference, drinking | MVP |
| Circadian clock | Internal phase, clock entrainment | Time-of-day variation in activity and sleep propensity | MVP |
| Sleep regulation | Sleep pressure, wake duration, sleep state, arousal threshold | Quiescence, sleep onset, waking and rebound | MVP |
| Arousal and vigilance | Background arousal, recent disturbances, threat signal | General readiness to move; startle or escape | MVP |
| Temperature stress | Preferred temperature, deviation, heat/cold stress | Movement towards suitable conditions; impairment at extremes | Phase 2 |
| Reproductive motivation | Sex, maturity, mating state, egg load | Mate seeking, courtship, egg-laying site search | Phase 2 |
| Grooming and body state | Contamination, grooming need | Brief grooming bouts and competing priorities | Phase 2 |
| Age and health | Age, damage, declining capacity | Activity, survival and longevity effects | Phase 3 |
| Experience and learning | Recent food locations, stimulus associations | Changing decisions based on prior outcomes | Phase 3 |

**Important:** These variables are not necessarily independent. For instance, thirst can suppress food seeking; hunger can modify locomotion and sleep; and an internal physiological state can change the *interpretation* of a sensory cue, not merely the urgency of a goal. The model must support such interactions explicitly.

Energy is a **budget**, not the sole determinant of movement. Feeding, drinking, sleeping and spontaneous exploration should not be triggered by simple fixed reserve thresholds alone. Model motivational drive separately from reserves and recent intake, and make the mapping adjustable.

## 5. Environment sandbox

Start with a **2D top-down arena**, with a visually distinct representation of walking and short flights. This is deliberately simpler than physically accurate 3D flight, so effort goes into behavioural mechanisms rather than aerodynamics.

### Environment elements

- **Food patches:** Location, quantity, attractiveness, accessibility and replenishment; optional odour gradients.
- **Water sources:** Location, accessibility, quantity and local humidity effects.
- **Light:** Brightness, location if relevant, programmable day–night cycle and abrupt changes.
- **Temperature and humidity:** Global settings initially; spatial gradients later.
- **Air movement:** Wind direction and strength; short disturbances or air puffs.
- **Obstacles, surfaces and resting sites:** Walls, exposed surfaces, sheltered regions and landing opportunities.
- **Threats:** Looming shadow, abrupt motion or gust, with controllable intensity.
- **Other flies (later):** Mates, competitors and social cues.

The fly perceives the world through **local, noisy sensory channels**: vision, odour, taste/contact, humidity, temperature and airflow. Perception has ranges, thresholds, sampling frequencies and uncertainty. Contact is required for actual feeding and drinking; simply reaching a food object's coordinates does not refill reserves.

Environmental gradients should be calculated independently of the fly's decision-making. Display them as overlays for the experimenter, while making clear which parts the fly itself can detect.

## 6. Behaviour engine

Use a layered design that makes the mechanisms testable separately.

**Layer A — Physiology.** Update energy expenditure, nutrient intake, water loss, hydration, circadian phase, sleep pressure and any other state variables.

**Layer B — Sensation.** Calculate what the fly can detect *at its current position and orientation*, incorporating range, occlusion where applicable, noise and current internal-state sensitivity.

**Layer C — Behavioural competition.** Generate propensities for feasible actions: remain awake and stationary, sleep, explore, approach food, feed, seek water, drink, walk, fly, groom or escape. Combine drives, context and recent behavioural history; permit urgent reflexes to override ordinary choices. Avoid a rigid priority ladder in which one modestly higher score always dominates.

**Layer D — Action selection and persistence.** Use a documented probabilistic choice mechanism (for example, a softmax over propensities or state-dependent transition hazards), with **hysteresis and minimum bout constraints where biologically justified**, to avoid rapid flickering between states. Probability functions should not imply that all possible behaviours are always available.

**Layer E — Movement and interaction.** Execute walking, flight, landing, consumption and collision behaviours with lightweight kinematics and different energetic costs. Longer-distance navigation should depend on sensed gradients and exploratory movement, not omniscient pathfinding.

### The key conceptual distinction: stationary is not necessarily sleeping

- **Awake and stationary:** Low motor output, continued sensory responsiveness, low expenditure; can be interrupted easily.
- **Sleep:** Sustained quiescence with higher arousal threshold; influenced by circadian and homeostatic sleep processes; disturbed sleep adds pressure for later recovery.
- **Active behaviour:** Walking, flight or interaction triggered by internal motivation, sensory opportunities, disturbances or stochastic transitions.

Do not assume every inactive period is recovery from exertion. A stationary interval can simply result from low current action propensities. Conversely, sleep should be an actively regulated state, not merely an inactivity timer.

### Explaining spontaneous transitions

The model must allow a fly to depart without a new visible stimulus. Candidate causes include gradual changes in hunger, thirst, sleep pressure or circadian arousal; internal stochastic variation; and sensory fluctuations below the experimenter's visual threshold. Crucially, the event log should distinguish these causes and label genuine model randomness rather than manufacturing a deterministic explanation.

## 7. Interface and observability

Design the app around three coordinated views:

1. **Sandbox:** An animated arena with drag-and-drop objects, playback controls, time acceleration, pause, step and optional sensory-field overlays. Users may manipulate the environment during a run.
2. **Fly inspector:** Current behaviour, internal-state gauges, detected cues, ranked feasible action propensities and relevant constraints. A short explanation such as: “Stationary while awake: low hunger and thirst; no urgent cue; background movement propensity low.”
3. **Experiment and timeline:** Annotated state transitions, event stream, charts of internal variables and activity, and comparisons between runs.

Offer configurable run duration, a seeded random number generator, scenario save/load, playback/replay and CSV/JSON export. Track model version and parameter set with each result. Present a separate **experimenter view** of hidden true state and the fly's imperfect perceived state.

A **counterfactual replay** feature is desirable later: replay identical initial conditions and random seed with one variable changed (for example, a water source removed), then compare outcomes. Its limitations should be clear: coupled stochastic trajectories may diverge after a perturbation.

## 8. Initial experimental scenarios

| Experiment | Setup | Question and expected pattern |
|---|---|---|
| **Why is it sitting still?** | Satiated fly, stable conditions, no immediate attractant | Measure awake-rest bouts and the proximate causes of departure; no preset rest timer |
| **Hunger awakens exploration** | No accessible food; declining reserves | Does food-seeking activity increase with deprivation? |
| **Thirst changes perception** | Moist and dry regions, water initially absent or inaccessible | Does hydration state alter humidity preference and water-directed behaviour? |
| **Feeding suppresses search** | Introduce an accessible food patch | Does recent intake reduce subsequent foraging and modify local exploration? |
| **Day–night cycle** | Programmable light schedule | Do activity and sleep patterns vary over time instead of simply tracking light on/off? |
| **Threat versus ordinary disturbance** | Approach, shadow or air puff at different strengths | Does response depend on threat intensity and whether the fly is awake or asleep? |
| **Conflict of needs** | Food and water at different locations; fly hungry and thirsty | How are competing motivations resolved, and what changes after one need is satisfied? |
| **Nothing changes externally** | Constant environment, long run | Can internal dynamics and variability produce plausible spontaneous activity? |

For each scenario, report multiple seeded runs, not just a compelling single animation. Display distributions of bout lengths, time allocation, search paths, food/water intake, transitions and survival where relevant.

## 9. Calibration, validation and scientific integrity

A believable-looking fly is insufficient. Define a small initial **behavioural evidence pack** from published observations. Examples include increased locomotion following food or water deprivation, thirst-dependent changes in humidity preference, circadian distributions of activity, and reduced responsiveness during sleep.

Use a three-level evaluation strategy:

- **Mechanism tests:** Check that physiology conserves resources consistently, stimuli are sensed only within appropriate ranges, and state transitions respond correctly to controlled inputs.
- **Qualitative validation:** Compare the direction of simulated effects with published experiments (e.g. thirsty versus hydrated flies).
- **Quantitative validation:** Where sufficiently matched data exist, compare distributions of activity bouts, search time, feeding, drinking and sleep—not only averages. Reserve some experiments as holdouts so the model isn't only tested on cases used to tune it.

Use uncertainty ranges and sensitivity analysis rather than treating hand-chosen coefficients as measured biological constants. Distinguish outcomes that were **directly encoded** from those that genuinely **emerged from interactions** between model components. Unexpected behaviour is a hypothesis generator, not evidence that flies behave that way.

## 10. MVP scope

The first release should establish one excellent experimental loop rather than attempt every known driver at once.

**Include:**

- One adult fruit fly, one 2D arena, walking plus simplified flight.
- Food and water patches; local sensory ranges/gradients; eating and drinking.
- Energy and hydration budgets; hunger and thirst motivations and their interaction.
- Awake-rest, exploration/foraging, sleep and escape behaviours.
- Circadian drive and configurable light cycle.
- Stochastic activity initiation with configurable seed.
- Visual inspector, event log, charted state history and run replay.
- Five predefined scenarios: baseline inactivity, deprivation, refeeding, hydration and day–night cycle.
- Automated tests and structured exports.

**Exclude initially:** Individual neurons, a language-model controller, physically accurate wingbeats, a 3D world, mating and reproduction, multi-fly social behaviour, genetic variation, learning, detailed ageing and highly realistic photorealistic graphics.

## 11. Implementation direction

A browser-based application is a sensible first target. A conventional, widely adopted stack would be **TypeScript**, **React**, **HTML Canvas 2D** (with a rendering library only if needed), **Vite** and **Vitest**; use **Playwright** for selected end-to-end tests. The simulation engine must be independent of React and the renderer so that experiments can run headlessly, in batches and faster than real time.

Suggested modules:

```text
simulation-core/
  clock-and-rng
  fly-physiology
  sensory-models
  behavioural-drives
  action-selection
  movement-and-interactions
  world-and-fields
  event-log-and-metrics
experiments/
  scenarios
  batch-runner
  validation
ui/
  arena
  inspector
  timeline-and-charts
  scenario-editor
```

Use a **fixed simulation time step** or explicitly documented multi-rate updates, and separate simulated time from rendering time. All randomness must be generated through a seeded simulation RNG. Export both parameter values and code/model version to make runs reproducible. Avoid physically unjustified precision and arbitrary frame-rate-dependent rules.

## 12. Delivery roadmap

### Milestone 1 — Minimal autonomous fly

A fly in a simple arena alternates between walking, occasional flight and awake inactivity, with no external objectives. Include seeded reproducibility and a transition log. **Gate:** movement is autonomous and inactivity bouts arise from the decision process, not from a countdown scripted for presentation.

### Milestone 2 — Physiology and resources

Add food, water, consumption, energy and hydration budgets, local sensing and deprivation-driven motivations. **Gate:** controlled deprivation and replenishment experiments produce the expected directional differences across repeated runs.

### Milestone 3 — Rest, sleep and time of day

Introduce a circadian clock, sleep pressure, distinguish sleep from awake inactivity, and add different sensory arousal thresholds. **Gate:** the model generates distinguishable stationary states and reacts differently to disturbances across those states.

### Milestone 4 — Experimental sandbox

Add drag-and-drop scenario editing, time controls, inspectors, charts, batch experiments, save/load and export. **Gate:** a user can formulate and compare a hypothesis without modifying code.

### Milestone 5 — Scientific refinement and extensions

Calibrate against published data, add environmental gradients and further drivers, publish a transparent evidence and limitations register, and prioritise extensions based on questions arising from experiments.

## 13. Risks and design safeguards

| Risk | Safeguard |
|---|---|
| The fly looks plausible only because actions are scripted | Separate behavioural propensities from animations; inspect transitions; use unscripted scenarios |
| Parameters are invented and outcomes appear scientific | Evidence labels, parameter provenance, calibration and uncertainty displays |
| A single global utility function creates artificial optimisation | Use distinct competing drives, context-dependent sensory weighting, variable persistence and stochastic transitions |
| Every fly instantly knows where resources are | Local sensing, noisy gradients, exploratory search and contact-dependent consumption |
| The model overfits a few demonstrations | Validate on different arenas, seeds and held-out experimental conditions |
| Sophisticated flight physics consumes all development effort | Begin with 2D kinematics and clear abstractions |
| “Rest” and “sleep” get conflated | Separate states, transition mechanisms and disturbance thresholds |
| Simulation is confused with a predictive biological model | Publish what is measured, assumed or hypothetical and where predictions remain unvalidated |

## 14. First research question and definition of success

**Research question:** Under stable external conditions, what combination of internal drives, sensory monitoring and spontaneous variability determines the distribution of awake-inactivity bouts in a satiated adult fruit fly?

Begin with a hydrated, fed fly in an otherwise unremarkable arena. Record many simulated hours and many seeds. Make its state visible and record why each inactive bout starts and ends. Then systematically vary food deprivation, water deprivation, circadian phase and sensory perturbations.

A successful first version should **not** produce a predetermined answer such as “flies wait until energy drops to 40%.” It should make clear which assumptions generate which inactivity patterns, show how sensitive those patterns are to parameter choices, and identify what real-world observations would distinguish competing explanations.

That would turn an everyday observation—a fly sitting inexplicably motionless near a sink—into a disciplined, testable behavioural-model project.

## Selected scientific references

1. **Sleep and circadian timing:** Dubowy & Sehgal, *Circadian Rhythms and Sleep in Drosophila melanogaster*, *Genetics* (2017). https://pmc.ncbi.nlm.nih.gov/articles/PMC5378101/
2. **Sleep physiology:** Helfrich-Förster, *Sleep in Insects*, *Annual Review of Entomology* (2018). https://doi.org/10.1146/annurev-ento-020117-043201
3. **Foraging and nutritional state:** *Exploration–exploitation trade-off is regulated by metabolic state and taste value in Drosophila* (2024). https://pmc.ncbi.nlm.nih.gov/articles/PMC11118379/
4. **Competing thirst and hunger drives:** *Thirst interneurons that promote water seeking and limit feeding behavior in Drosophila*, *eLife* (2021). https://pmc.ncbi.nlm.nih.gov/articles/PMC8139827/
5. **State-dependent humidity preference:** *Thirst-driven hygrosensory suppression promotes water seeking in Drosophila*, *PNAS* (2024). https://pmc.ncbi.nlm.nih.gov/articles/PMC11348324/
6. **Evidence that physiological state can change humidity preference:** *Gliotransmission of D-serine promotes thirst-directed behaviors in Drosophila* (2022). https://pmc.ncbi.nlm.nih.gov/articles/PMC9616736/
7. **Research context for layered behavioural simulations:** *A behavioral architecture for realistic simulations of Drosophila larva locomotion and foraging* (2026). Note: this work concerns **larvae**, not adult flies. https://pmc.ncbi.nlm.nih.gov/articles/PMC13480992/
