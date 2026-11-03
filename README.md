# Fly Behaviour Simulator

A browser-based simulator for watching one adult male fruit fly live in a Room and seeing why it starts, continues and stops each behaviour. See [GLOSSARY.md](GLOSSARY.md) for domain terms and [docs/adr](docs/adr) for decisions.

Model values are roughly tuned so that the behaviour is worth watching: over about 10 simulated minutes, a default run nearly always shows Immobility, grooming, walking and flight, a settled fly often stays in awake Immobility for more than 5 minutes, and over a day the fly sleeps in a morning, siesta, evening and night pattern. They are Provisional and not validated, including flight speed and frequency, and all sleep, startle, light and clock values. A fly kept awake through the night sleeps more the next morning, which comes from its raised sleep pressure rather than a rule of its own.

Phase 5 tried tuning them against the [Evidence Pack](evidence/README.md), never its held-out targets. Values that met nearly every target left the fly hardly ever still and awake for 5 minutes, with a weaker rebound, and failed both held-out targets, so they weren't adopted. The validation view shows where the model as it is meets the published data and where it doesn't, and `validation/awaitingTuning.ts` says why each miss needs a change to the model rather than to its values. A slow Driver, Restlessness, was added for that (#81), but tuning it cost the fly its rebound and its response to darkness, so its rates are 0 for now and the Room behaves as before.

Since phase 3, the fly also has an Energy Reserve and a Hydration Reserve, feeds and drinks, and finds food and water by searching the Odour and Humidity Fields rather than knowing where they are. A default day shows feeding and drinking trips as well as the phase 1 and 2 patterns, and a default run lasts for days. Energy use, water loss, intake, the fields, steering, how Hunger and Thirst act, weakening and survival times are all roughly tuned and Provisional, and are not claimed as validated.

## Run it

From the repo root, with Node 24 or later:

```powershell
npm start
```

This installs dependencies if needed, starts the app and opens it in your browser. On Windows, you can double-click `run.bat` instead.

## What you can do

- **Watch:** the fly acts on its own. Bars show what is pushing each transition, the red strip shows its chance of firing within the next simulated minute, and a flash marks each firing. Hover over a bar for numbers.
- **Time:** pause, resume or change the speed from 1× to 1000×. The ribbon at the bottom shows behaviour over the last 60 seconds of real time at the current speed, with a thin strip along its foot for day and night. The dial shows the time of day on a 24-hour face, with noon at the top, and hovering over the bottom bar gives the number.
- **Sleep:** the ribbon shows true sleep in violet, darker when deeper, which a lab's camera can't see. In the Room a sleeping fly looks exactly like an awake immobile one.
- **Disturb:** the lightning bolt disturbs the fly. An orange segment jumps up in the bars it pushes, and a white line marks the moment on the ribbon. Hover over a row for numbers, including Sleep Depth while the fly sleeps. Holding the button down repeats it about 20 times a second, which can keep the fly from sleeping.
- **Cameras:** drag the main view to orbit. The inset always tracks the fly, and clicking it swaps it with the main view. The fly is drawn at true scale, and the amber ring only marks where it is. A dark spot on the floor shows where the fly is above the floor. It is a marker of a fixed size, as a true-scale shadow would be too small to see.
- **Restart:** the circular arrow repeats the run with the same seed, and the die starts one with a new seed. The cube sets the Room's size, from 0.1 to 5 m in each direction, and restarts with the same seed. Your time speed is kept. All of this is in the page's URL as `seed`, `width`, `depth`, `height` and `speed`, for example `?seed=123&width=0.3&depth=0.5&height=0.2&speed=10`. A restart gives the run without any Disturb presses, schedule changes, or moved or removed food and water.
- **Replay:** the circular arrow with a play mark, beside the restart arrow, starts the run again from the beginning with the same seed and settings and everything you changed during it: Disturb presses, light schedule changes, and moved, removed or restored food and water, each at the moment you made it. The white lines, the patches and the light come back as they did, and the fly does exactly what it did before, at any time speed. Anything you change during a replay is added to it, so the next replay has both. Your time speed is kept. The changes don't fit in the URL, so reloading the page gives the run without them, as a restart does.
- **Export:** the download arrow exports the run you are watching, named with its seed and how far the run has got in simulated seconds. Choose how many simulated seconds apart its samples are first, 10 by default. JSON downloads one gzipped file, such as `fly-sim-seed-42-at-3600s.json.gz`, which alone is enough to trace and reproduce the run. CSV downloads three gzipped tables for a notebook, such as `fly-sim-seed-42-at-3600s-samples.csv.gz`, and the browser may ask once whether the page may download several files. See [Exported runs](#exported-runs).
- **Open:** the folder opens an exported run's JSON, from the viewer or a [batch](#run-a-batch), and replays it from the beginning with its seed, setup, parameters and Interventions, exactly as Replay does. The URL changes to match it where it can, and Replay, Restart and the die then work as they do for any other run, so anything you change adds to the replay. A file from another model version might not replay the same run, so you're asked first. A file in a record format version this simulator can't read is refused, and so is a file that isn't an export.
- **Food and water:** the straw-yellow patch towards the south-west corner is food and the blue patch towards the north-east corner is water. The fly can feed or drink only while standing on one, and it finds them by following odour and humidity, so it can miss one that is out of range. The ribbon shows feeding in vermilion and drinking in cyan, and the bars show Hunger, Thirst, Odour and Humidity. `food` and `water` in the URL set where they start, in metres from the west and south walls, and `energy` and `hydration` how full the fly's reserves start, from 0.01 to 1, for example `?food=0.2,0.3&water=0.8,0.7&hydration=0.1`.
- **Fields:** the wavy-lines button shows what the fly could detect: the Odour Field in olive and the Humidity Field in pale blue, each fading out to a faint dome where its range ends.
- **Moving food and water:** drag a patch across the floor of the main view to move it. Dragging a patch doesn't orbit the camera. Its field moves with it, but the fly only finds out when it senses the new place.
- **Removing food or water:** the dish and drop buttons take the food or water away and put it back. Without it, the matching reserve keeps falling, the fly weakens, and when a reserve runs out it dies: a banner says so, and the ribbon and bars stop. Restart and the die still work.
- **Validation:** the chart icon in the controls opens the validation view, over the Room, which keeps running underneath. It shows the latest validation report. First comes a chart per Validation Target, with the published values and their uncertainty, each simulated fly and the model's pooled value, and whether the model meets the target. Held-out targets carry a padlock. Then come bout shapes: survival curves of each assay's Inactivity and Activity Bouts, per fly and pooled, beside an exponential, the published fit and the fitted descriptive baseline, with Log–log and Log–linear switches and the test's result at each step size. Then Scoring Disagreement: for each assay, how much of its Scored Sleep the fly was really awake for, and how much true sleep it missed, by hour, as time or as bouts. Last comes every relationship in the model, grouped as Established, Provisional or Hypothesis. Hover over any mark or entry for its numbers or its source. The header says when the report was made, for which model version, step size and seeds, and marks it stale if the model or its parameters have changed since. With no report it says to run `npm run validate`. The back arrow or Escape returns to the Room, and `?view=validation` in the URL opens straight onto the view.
- **Light schedule:** a run starts at lights-on, at 06:00, with 12 hours of light. The sun opens a menu that changes the schedule during the run: set the lights-on and lights-off times and press Set, or choose always on (sun) or always off (moon). The Room and the dial change at once, and the fly's activity responds at once, but its Circadian Clock takes days to follow, so darkness alone doesn't send it to sleep. While paused, the Room and dial change at once, and the fly gets the change when you resume. A restart goes back to the starting schedule. `lightHours` in the URL changes the starting hours of light, for example `?lightHours=0.05` for lights-off after 3 simulated minutes.

## Run a batch

A batch runs many seeded Simulation Runs without the viewer or a browser, and writes their exports for a notebook. From the repo root, with Node 24 or later and nothing else installed:

```powershell
npm run batch -- --seeds 20 --duration 3d
```

Each seed runs in its own Node process, as many at once as the machine has cores. A simulated day takes about 5 seconds per seed, so tens of seeds over a few days finish in minutes. The command reports each seed as it finishes, and how long the batch took. Its options are:

| Option                           | What it sets                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--seeds`                        | How many seeds, from 1 (`10`), a range (`5-9`, or `42-42` for one) or a list (`3,7,42`). 10 by default.                                                                                      |
| `--duration`                     | How long each run lasts in simulated time, in `s`, `m`, `h` or `d`, such as `90m` or `2d`. 1 day by default. A run whose fly dies ends there.                                                |
| `--out`                          | The directory to write to, `batch-output` by default. A batch run again overwrites its files.                                                                                                |
| `--sample-interval`              | Whole simulated seconds between exported samples, 10 by default.                                                                                                                             |
| `--width`, `--depth`, `--height` | The Room's size in metres, from 0.1 to 5, as the viewer's URL has them.                                                                                                                      |
| `--food`, `--water`              | Where each starts, as `x,y` in metres from the west and south walls.                                                                                                                         |
| `--energy`, `--hydration`        | How full each reserve starts, from 0.01 to 1.                                                                                                                                                |
| `--light-hours`                  | The starting hours of light from lights-on at 06:00, from 0 to 24.                                                                                                                           |
| `--steps-per-second`             | The run's step size, in whole steps per simulated second from 25 to 1000, 50 by default. Rates act per simulated second, so it changes runs only by chance, and samples stay a second apart. |
| `--jobs`                         | How many seeds run at once, one per core by default. It changes nothing in the files.                                                                                                        |

`npm run batch -- --help` lists them too. An invalid option, such as a Room too small for the fly, stops the batch with a message saying what is wrong before any run starts.

The output directory holds:

- `samples.csv.gz`, `transitions.csv.gz` and `interventions.csv.gz`: the [CSV tables](#csv-tables) of every seed, one after another under a single header row, so one pandas load gives every run.
- `manifest.json`: what was run, with the command's options, the model version and the record format version, and for each seed how long its run lasted in simulated seconds, whether its fly died and how, and its files.
- `seeds/`: each seed's [export](#exported-runs) as JSON, such as `fly-sim-seed-3-at-259200s.json.gz`, and its own three tables. Each is in the viewer's format, and the viewer can open the JSON to replay the run.

The same command run again writes identical files. For example, Inactivity Bout durations per seed, from the fly entering Immobility or sleep until it next leaves both:

```python
import pandas as pd

transitions = pd.read_csv("batch-output/transitions.csv.gz")
INACTIVE = ["immobility", "sleeping"]

def inactivity_bouts(run):
    # Where the fly starts or stops being inactive. The bouts cut short by the start and end of
    # the run are left out.
    changes = run[run["to"].isin(INACTIVE) != run["from"].isin(INACTIVE)]
    starts = changes["time_s"].where(changes["to"].isin(INACTIVE))
    ends = changes["time_s"].where(~changes["to"].isin(INACTIVE)).shift(-1)
    bouts = pd.DataFrame({"start_s": starts, "end_s": ends}).dropna()
    return bouts["end_s"] - bouts["start_s"]

bouts = transitions.groupby("seed").apply(inactivity_bouts).rename("duration_s")
print(bouts.groupby(level="seed").describe())
```

## Validate the model

The validation suite runs Virtual Assays of the Reference Fly against the [Evidence Pack](evidence/README.md)'s Validation Targets and writes a report the validation view shows. From the repo root, with Node 24 or later:

```powershell
npm run validate:view
```

This installs dependencies if needed, runs the suite and then opens the app on the validation view, with the report it has just written. The suite takes about 5 minutes on a machine with 20 threads, and longer with fewer. `npm run validate` runs the suite alone. Each study's Chamber, Light Schedule and instruments are set up as the study set up its own, after a simulated day for the fly to settle, and each simulated fly runs in its own Node process, as a batch's seeds do, 16 seeds per study. The assays that score bouts run again at 25 steps a second as well as the default 50, for bout shapes. The report goes to `validation-output/report.json`, tagged with the model version, parameters, step size and seeds, and the same command gives the same report apart from when it was made.

Each target is a test. A target the model doesn't meet fails the suite, except a held-out target, which is reported but never tuned against, and the targets listed in `validation/awaitingTuning.ts`, which the current model can't meet. That file says why, and what change to the model each would need. Those are expected to fail, so one that starts to match fails the suite until it is taken off the list.

The report also holds:

- **Bout shapes**, ADR-0001's first validation stage: each assay that scores bouts must give Inactivity Bouts with a falling hazard and Activity Bouts close to exponential, per fly and pooled, at both step sizes. The test fits a Weibull distribution to the bouts of at least 3 s and asks, by a likelihood ratio at the 1% level, whether it fits better than an exponential. A Weibull shape below 1 is a falling hazard. A shape within 0.8 to 1.25 still counts as close to exponential, a stated margin, as with tens of thousands of bouts the test rejects even a slight departure: the model's Activity Bouts pass by that margin, at a shape of about 0.95, rather than by the test failing to reject an exponential. The pooled bouts at the two step sizes must also be within a Kolmogorov–Smirnov distance of 0.05 of each other. The report says whether a falling hazard shows only when flies are pooled, which would be an artefact of pooling flies that differ. Each is a test of the suite.
- **The descriptive baseline**: a power law with an exponential tail, whose chance of ending falls with time in a bout as β/t + 1/τ, fitted to each bout-duration target's published fit, as the pack has only fits. The report gives its form, method and fitted values, the same form fitted to the model's bouts, and how far the model's bouts and the published fit are from it. As the pack gives only fits, each a power law or an exponential tail, which the baseline's form contains, the published fit's distance is 0. It becomes a real measure once a target's own data are in the pack. Nothing in the model uses it, and lint stops the engine importing anything from validation.
- **Scoring Disagreement**: for each assay, the share of Scored Sleep during which the fly was really awake, and the share of true sleep it didn't score, per fly and pooled, as time and as bouts, by hour. It measures the 5-minute rule, not the model, so it never decides whether the model passes, and it is the one place the true Vigilance State is set beside an assay's scoring.
- **Relationship labels**: every parameter and Driver relationship, labelled Established, Provisional or Hypothesis in `src/engine/relationships.ts`. A test fails on a missing label, and on an Established one whose citation isn't a counted target in the pack.

`npm run tune -- <overrides.json>` runs the assays of every target but the held-out ones with candidate parameters, and prints whether each comparison passes. It never runs a held-out target. Phase 5's tuning with it found values that met all the tuning targets but one, but they weren't adopted, as the [model values](#fly-behaviour-simulator) above say.

Where a source leaves a choice open that an assay can't, such as a movement threshold in pixels of unknown size, `CALIBRATIONS` in `src/validation/assays.ts` makes it and says why.

## Exported runs

An export is a gzipped JSON file that holds everything needed to trace and reproduce a run. Its fields are:

| Field                                            | What it holds                                                                                                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`                                         | Always `"fly-sim-run"`.                                                                                                                                                                             |
| `recordFormatVersion`                            | The version of the file's layout, now 3. Version 1 had no `chamber`, and versions 1 and 2 had no Restlessness. The simulator still reads both, with Restlessness pushing nothing.                   |
| `modelVersion`                                   | The model that made the run. Another model version might not reproduce it.                                                                                                                          |
| `seed`, `triggerStream`                          | The run's seed, and which random stream drew its Trigger Levels.                                                                                                                                    |
| `stepsPerSecond`                                 | The run's step size, in fixed steps per simulated second, 50 unless its setup gave another. A replay runs at the same step size.                                                                    |
| `room`                                           | The Room's size in metres, or the chamber's.                                                                                                                                                        |
| `chamber`                                        | The study's Chamber the run was in, for a Virtual Assay: its `name`, whether flight was possible and how close the fly had to be to touch food or water. `null` for the Room.                       |
| `parameters`                                     | Every model parameter, including `initialEnergy` and `initialHydration`, how full the reserves started.                                                                                             |
| `food`, `water`                                  | Where each started, in metres from the west and south walls, or `null` for none.                                                                                                                    |
| `lightSchedule`                                  | The schedule the run started with. Changes to it are among the Interventions.                                                                                                                       |
| `step`, `death`                                  | The step the run had reached, and how and when the fly died, or `null`.                                                                                                                             |
| `interventions`                                  | Every Intervention, with the step it applied at.                                                                                                                                                    |
| `firedTransitions`                               | Every fired transition, with its Trigger Level, its hazard and Driver contributions, and the fly's state when it fired.                                                                             |
| `timeOnSurfaceSeconds`, `timeInBehaviourSeconds` | Totals over the whole run.                                                                                                                                                                          |
| `sampleIntervalSeconds`, `samplesStartSeconds`   | How many simulated seconds apart the samples are, and when the exported samples start.                                                                                                              |
| `samples`                                        | The fly's full state at every multiple of the interval, and at the moment of death if the fly died: behaviour, Vigilance State, position, reserves, Drivers and each available transition's hazard. |

Samples are thinned, as a full-detail record is about 170 MB of JSON per simulated day, but fired transitions and Interventions never are, so bout durations come out exact. A long viewer run keeps only its latest two to four and a half simulated days of samples, and `samplesStartSeconds` then says where they start. The setup and Interventions still cover the whole run, so the full-detail run can always be regenerated from the file, with `createSimulationRun(replaySetup(file))` advanced by `file.step` steps.

An export holds the run so far. Exported part-way through a replay, it has the replayed Interventions the run has reached, and not those still to come, which Replay would also repeat.

Python reads it with its own modules:

```python
import gzip, json

with gzip.open("fly-sim-seed-42-at-3600s.json.gz", "rt") as file:
    run = json.load(file)

print(run["seed"], run["modelVersion"], len(run["firedTransitions"]))
bouts = [(each["step"], each["from"], each["to"]) for each in run["firedTransitions"]]
```

### CSV tables

The CSV export has three tables, each with one header row. Every row starts with `seed`, `model_version`, `step` and `time_s`, so tables from many runs stack into one frame. A cell that doesn't apply, such as Sleep Depth while the fly is awake, is empty, which pandas reads as missing.

- **`samples`:** one row per exported sample, thinned as the JSON's are, with the moment of death as its last row if the fly died. Its columns are `time_of_day_h`, `light_level`, `lights_on_h` and `light_hours` (the schedule in effect), `behaviour`, `vigilance_state`, `surface`, `x`, `y` and `z` (metres from the west wall, south wall and floor), `speed_m_per_s`, `energy`, `hydration`, `hunger`, `thirst`, `sleep_pressure`, `sleep_depth`, `arousal`, `restlessness`, `circadian_phase_h`, `startle`, `odour`, `humidity`, `recent_odour`, `recent_humidity`, `touching_food`, `touching_water`, `food_x`, `food_y`, `water_x` and `water_y`, and `death_cause`, which is empty until the row for the moment the fly died. Then, for each transition, such as `immobility_to_walking`, come its `_hazard` per second, a column per Driver with that Driver's contribution, such as `immobility_to_walking_sleep_pressure`, and `_p_next_minute`, the red strip's chance of firing within a minute. A transition that isn't available from the current behaviour has empty cells, not zeros.
- **`transitions`:** one row per fired transition, never thinned: `transition`, `from`, `to`, `trigger_level`, `hazard`, a column per Driver with its contribution (`spontaneous`, `arousal`, `contact`, `light`, `sleep_pressure`, `circadian`, `startle`, `hunger`, `odour`, `thirst`, `humidity`, `restlessness`), `p_next_minute`, and the state when it fired: `vigilance_state`, `sleep_pressure`, `sleep_depth`, `hunger` and `thirst`. A transition's `step` is the end of the step it fired in, so the behaviour it leads to shows from the sample at that step.
- **`interventions`:** one row per Intervention, never thinned: `type` (`disturb`, `light-schedule`, `move-source`, `remove-source` or `restore-source`), `source`, `x` and `y` for a move, and `lights_on_h` and `light_hours` for a new schedule.

pandas reads them as they are:

```python
import pandas as pd

samples = pd.read_csv("fly-sim-seed-42-at-3600s-samples.csv.gz")
transitions = pd.read_csv("fly-sim-seed-42-at-3600s-transitions.csv.gz")
interventions = pd.read_csv("fly-sim-seed-42-at-3600s-interventions.csv.gz")

samples.groupby("behaviour")["time_s"].count()
```

The CSV column layout is part of the same contract as the JSON, under the same record format version.

The record format version is a compatibility contract. Every later version of the simulator reads files written at any released version, or comes with a proposed way to migrate them.

## Test phase 1

Run `npm start` from the repo root, as above, and then:

1. **It lives on its own.** Watch for a minute at the default 60×. The fly moves around with no input, and the ribbon fills with four colours: blue for Immobility, green for grooming, amber for walking and pink for flight. Flights are short, so pink shows as thin slivers. If you see no pink after about 10 simulated minutes (10 real seconds at 60×), press the die for another run.
2. **It looks like a fly.** Click the inset to fill the main view with the close-up, and set the speed slider to 1×. You should see a body, head, red eyes, wings and six jointed legs.
3. **Its movement matches what it's doing.** Still in the close-up, compare the fly with the side panel, where the bright rows are the ones that start from the current behaviour. Raise the speed to reach a behaviour and drop it to 1× or 2× to look. At 60× and above, legs and flights go by too fast to read, and the ribbon carries the story.
   - Walking: the legs step in alternating sets of three.
   - Immobility: nothing moves at all.
   - Grooming: only the two front legs rub together under the head, and the fly stays where it is.
   - Flight: the wings become a blur, the legs tuck in and the fly travels through the air. Its wings are at rest in every other behaviour. You can't speed up to a flight and then slow down, as it lasts only about a second of simulated time. Stay at 2× and wait: a flight comes about once a minute and lasts about half a second, and it is easiest to catch by watching the wide view.
4. **It goes everywhere.** Click the inset to go back to the wide view, and watch at 120× or more. The fly lands on, and walks over, the floor, walls and ceiling, and it stays upside down on the ceiling with its feet on the surface. Off the floor, a dark spot on the floor marks the point below it.
5. **Bars match what it does.** Each row of the side panel is one possible transition. Its bar shows what is pushing it, its red strip brightens as firing becomes more likely, and it flashes when it fires. The behaviour then changes to match. Hover over a row for numbers.
6. **Time speed changes nothing.** Note what the ribbon does, press the circular arrow and watch again at another speed. The run is the same, only faster or slower.
7. **Restart and Room size.** The circular arrow gives the same run again, and the die gives a different one. In the cube's form, set a Room of 0.3 × 0.5 × 0.2 m and press Restart: the view reframes to the new Room, and the fly stays inside it.

Tell us whether it looks and feels right. How often the fly does each thing is a rough tuning, so that is useful feedback too.

## Test phase 2

Run `npm start` from the repo root, as above, and then:

1. **A day has a shape.** Set the speed to 1000× and watch for a minute or two. Along the strip at the ribbon's foot, each pale stretch is a day and each dark stretch a night. Violet is sleep. You should see an active morning, violet building around midday for the siesta, an active evening, and mostly unbroken violet at night. The pattern repeats each day but never exactly, and the ribbon spans about 17 simulated hours at this speed.
2. **Day and night in the Room.** Still at 1000×, the Room dims when the dial's red hand enters its dark half at 18:00 and brightens at 06:00. The fly stays findable at night through the amber ring and the close-up.
3. **Sleep looks like Immobility.** Drop to 60× and wait for violet to grow at the ribbon's right-hand end. The fly is motionless, just as in blue Immobility. Only the ribbon and the bars show the difference: the row with a moon on its left is live, and hovering over it shows Sleep Depth.
4. **Awake Immobility for minutes.** At 60×, a simulated minute is a real second. Now and then the fly stays blue, awake and motionless, for more than 5 seconds, which a lab would score as sleep. Thin violet slivers are sleep too short for a lab to score. When a long blue stretch ends with no input from you, the row that flashed shows what pushed it, and hovering over it gives the numbers.
5. **Deep sleep is harder to leave.** Hover over the moon row for a few minutes of sleep. Sleep Depth rises from near zero as the bar shrinks, and the ribbon's violet darkens.
6. **Disturb in light and deep sleep.** At 60×, press the lightning bolt in each of three states, and press the circular arrow to start again if you want to repeat one. Awake, the fly reacts at once. Lightly asleep (pale violet), it usually wakes. Deeply asleep (dark violet, most likely at night), it often sleeps on. Each press leaves a white line on the ribbon and an orange segment in the bars that holds for about a second. Paused, a press leaves its white line at once, and the bars jump only when you resume.
7. **Rebound after lost sleep.** Add `?seed=42&speed=1000` to the end of the page's address and press Enter. When the dial's hand reaches the bottom, at midnight and about a minute in, press and hold the lightning bolt until it reaches 06:00, about 20 seconds later. The ribbon fills with white lines instead of violet, and in the row that ends in a moon, the blue sleep pressure segment grows longer than it gets on a normal night. Let go and watch the morning: there is more violet than usual over the next few hours, and it fades back to the normal pattern by the next day. Press the circular arrow to see the same run without your presses, with less violet that morning.
8. **Changing the light schedule.** At 1000×, press the sun beside the cube and then the moon in its menu, for always off. The Room dims and the dial goes dark at once, and the pale light segment leaves the bars at once, so the fly is a little less likely to start walking. But it doesn't simply sleep: its clock keeps running, so the next day still has an active morning, a siesta and a sleepy night at the usual times. Press the circular arrow to start again, then use the sun's menu to set lights-on to 12:00 and lights-off to 00:00 and press Set. The Room follows the new times at once, while the violet of the night moves later bit by bit over the following days rather than jumping.
9. **Reproducible.** The circular arrow repeats the run without your presses and schedule changes, and the fly does the same things at any speed.

Sleep's timing, the rebound and the light schedule's effects are rough tunings, so feedback on how they look is useful.

## Test phase 3

Run `npm start` from the repo root, as above, and then:

1. **Food and water in the Room.** In the wide view, the straw-yellow patch near the south-west corner is food and the blue patch near the opposite corner is water. Click the inset to see the close-up, which follows the fly, and click it again to go back.
2. **Trips to eat and drink.** Set the speed to 1000× and watch for a few minutes. Vermilion slivers on the ribbon are feeding and cyan ones are drinking. Over a simulated day, which is about a minute and a half at this speed, the fly should make at least one trip to each, while the morning, siesta, evening and night pattern of violet sleep stays recognisable. In the bars, the raspberry Hunger and blue Thirst segments grow between trips and shrink after them.
3. **Feeding and drinking look right.** When the fly is on a patch, drop to 2× and click the inset. While it feeds or drinks it stands still with its mouthparts reaching down to the surface. It stops when the Hunger or Thirst segment in the row that ends in a dot has grown, not after a set time.
4. **What the fly can sense.** Press the wavy-lines button. The olive glow around the food and the pale blue glow around the water show what the fly could smell or feel, fading out to a faint dome where each ends. At 60×, watch a fly outside both glows: it wanders without heading for either, and can walk past one without noticing. Once inside a glow, a hungry or thirsty fly tends to work its way in.
5. **Dragging food or water.** Drag the food to another part of the floor. The camera doesn't orbit, and the olive glow moves with it. Paused, the patch moves at once, and the fly gets the change when you resume. A fly that can't smell the new place doesn't head for it, and the ribbon shows its trips change. A source can't leave the floor or the Room.
6. **Weakening and death.** Press the water's drop button to take the water away, and watch at 1000×. Thirst grows and the fly searches more, then, as its Hydration Reserve runs low, it does less and less. Within about a day and a half, a couple of minutes at 1000×, or sooner if you add `&hydration=0.1` to the page's address first, a red banner says the fly has died of lack of water, it lies on its back, and the ribbon and bars stop. Press the circular arrow to start again with the water back. The dish button does the same for food, at about the same pace.
7. **Reproducible.** The circular arrow repeats the run without your drags and removals, and the fly does the same things at any speed.

Feeding and drinking frequency, how far the fields reach, how hard the fly searches and how long it survives are rough tunings, so feedback on how they look is useful.

## Test phase 4

Run `npm start` from the repo root, as above, and add `?seed=123` to the end of the page's address. Then:

1. **Replay a run with changes.** At the default 60×, after about 30 simulated seconds, press the lightning bolt twice, open the sun's menu and press the moon for always off, and drag the food to another place on the floor. Let it run for another minute and watch the ribbon. Press Replay, the circular arrow with a play mark beside the plain one. The run starts again from 06:00 on the dial: the white lines come back at the same moments, the Room goes dark when it did, the food jumps to where you dropped it when you dropped it, and the ribbon repeats what it showed. Set the speed to 600× and press Replay again, and the same run plays faster.
2. **Changes add to a replay.** During the replay, press the drop to take the water away. Press Replay: the earlier changes and the water's removal all happen again, and the drop button shows the water gone when it went.
3. **Export as JSON.** Once the replay is past the moment you took the water away, press pause. Press the download arrow, leave the sample interval at 10 and press JSON. A file named like `fly-sim-seed-123-at-150s.json.gz` downloads. With Python, `python -c "import gzip, json; run = json.load(gzip.open('fly-sim-seed-123-at-150s.json.gz', 'rt')); print(run['seed'], [each['type'] for each in run['interventions']])"`, with your file's name, prints `123` and your five changes: two `disturb`, then `light-schedule`, `move-source` and `remove-source`.
4. **Export as CSV.** Press the download arrow and CSV, and allow several downloads if the browser asks. Three files download, ending in `-samples.csv.gz`, `-transitions.csv.gz` and `-interventions.csv.gz`. Each opens with pandas' `pd.read_csv`: the samples table has a row every 10 simulated seconds, and the interventions table a row for each change.
5. **Open an exported run.** Press the plain circular arrow, and the run starts without any of your changes. Press the die for a different run, then the folder, and choose the JSON from step 3. The page loads the exported run, with `seed=123` in its address, and replays it from the start with all your changes, as it was.
6. **Run a small batch.** In a second terminal, from the repo root, run `npm run batch -- --seeds 4 --duration 6h --out batch-test`. It prints a line for each seed as it finishes, and how long the batch took, a few seconds. `batch-test` then holds `manifest.json`, the three combined tables and a `seeds` folder. Open one of the seeds' JSON files in the viewer with the folder, and it plays that seed's run, with its seed in the page's address.
7. **Files that aren't runs.** Open `batch-test/manifest.json` with the folder. The page says it isn't an exported run, and the run carries on.

Replay, export and the batch runner are new, so feedback on how they work for your analysis is useful.

## Test phase 5

From the repo root, run `npm run validate:view` as [above](#validate-the-model). It takes about 5 minutes, and the browser then opens on the validation view. Then:

1. **From the Room.** Press the back arrow at the top left. The Room is there, still running. Press the chart icon among the controls at the bottom, and the validation view opens again over it. The header gives the time the report was made, model 0.7.0, a step of 20 ms and seeds 1–16, with no red Stale banner.
2. **Each target's result.** Each card is a Validation Target, with a green Pass or a red Fail and a sentence saying why. Hover over a fly's dot, the diamond for all flies together, or the published value, for its numbers and, for the published value, where in the source it comes from. Dark-phase beam sleep passes. The model doesn't yet meet Xu 2021's bout exponents or daily profile, Zimmerman 2008's light-phase beam sleep, Geissmann 2019's ethoscope sleep or Cascallares 2018's Activity Bout tail. Those are expected failures until the model changes, as the README's [Validate the model](#validate-the-model) says.
3. **The held-out targets.** Two cards carry a padlock and Held out: Zimmerman 2008's video light-phase sleep, which passes, and Cascallares 2018's quiescence exponent, which doesn't. Neither was tuned against.
4. **Bout shapes and the baseline.** Scroll to Bout shapes. There is a card for each kind of bout in Xu 2021's and Cascallares 2018's assays. Each card has a Pass for 50 and for 25 steps a second, and a Pass for how closely the two agree. Inactivity Bouts' curves bend away above the dashed exponential, which is the falling hazard, while Activity Bouts' curves follow it. Press Log–linear and Log–log to switch the axes. On the Inactivity Bout cards, the gold line is the published fit and the pink dash-dot line is the descriptive baseline. Hover over the paragraph beginning Descriptive baseline for its form, and over the chart for each curve's share at that duration.
5. **Scoring Disagreement.** Scroll to Scoring Disagreement, labelled a measure of the 5-minute rule rather than a Validation Target. Each assay's card gives the share of Scored Sleep during which the fly was really awake, in blue, and the share of true sleep the assay missed, in violet. The chart shows both by hour of the day. Hover over an hour for its numbers, and press Bouts to count bouts instead of minutes.
6. **What the model rests on.** At the bottom, every relationship and parameter is listed as Established, Provisional or Hypothesis. Hover over the Circadian Clock's Established entries for the target that supports them, and over a Hypothesis, such as arousal starting a still fly walking, for what it proposes.
7. **A stale report.** Leave the app running, open `src/engine/parameters.ts`, change `initialArousal: 0.5` to `initialArousal: 0.6` and save. The page reloads. If it opens on the Room, press the chart icon. A red banner now says the report is Stale and names `initialArousal`, and the charts still show. Change the value back and save, and once the page reloads the banner has gone.

The bout-shape test, the baseline and the disagreement measure are new, so feedback on what they show and how they read is useful, as is what you make of the targets the model doesn't meet.

## Code map

- **`src/engine`** is the model, with no rendering or UI code. Lint stops it importing three.js or the viewer. Its one interface is `createSimulationRun` in `simulationRun.ts`, re-exported from `index.ts`: give it a setup, advance it, intervene and read its Run Record. A setup's `stepsPerSecond` sets the run's step size, 50 by default, and its `chamber` runs the fly in a study's Chamber instead of the Room, with `room` as the Chamber's size. `model.ts` has the behaviours, Drivers and transitions, including Hunger, Thirst, steering by odour and humidity, and weakening. `parameters.ts` has the model's parameters and their defaults, including the reserves' rates. `physiology.ts` has the run's `Clock`, which every per-step update scales by, and the per-step state updates: arousal, Sleep Pressure, Sleep Depth, the Circadian Clock, Startle, the Energy and Hydration Reserves, and what the fly has sensed lately. `simulationRun.ts` sets up and steps the run, fires transitions, moves the fly, applies Interventions, ends the run on death and keeps the Run Record, and its `replaySetup` gives the setup that replays a recorded run. `setupOptions.ts` turns the setup choices the experimenter has, in the viewer's URL or a batch's command, into a setup, and checks them. `runExport.ts` converts a Run Record into the export format, reads exports back, and holds the record format version, and `runTables.ts` turns an export into its CSV tables and names an export's files, for the viewer and the batch alike. `roomContents.ts` holds the Room's contents, or a Chamber's: where the food and water are, whether they are there, contact with them, and the Odour and Humidity Fields. `exactMath.ts` has the elementary functions the engine uses, such as `exp` and `sin`, computed the same way on every platform. `Math`'s own differ in their last bits between Node and browsers, so lint stops the engine using them, and a batch run in Node replays exactly in the viewer. `movement.ts` has the fly's movement over the Room's surfaces, `lightSchedule.ts` the Light Schedule and `random.ts` the seeded random streams.
- **The worker path.** The engine runs in a Web Worker, so a new run setting or command has to pass through all four of `src/viewer/protocol.ts` (the messages), `simulationWorker.ts` (owns the Simulation Run), `simulationClient.ts` (the viewer's side) and `main.ts` (wires the viewer together). Replay and export go this way too: the worker hands back a replay's setup, and builds and gzips an export itself, with `gzip.ts`, so a long run's record never has to cross to the page. `download.ts` saves the files.
- **Settings, restart and replay.** `runSettings.ts` reads and writes a run's settings in the URL, including where the food and water start and how full the reserves start, and turns them into a setup through the engine's `setupFromOptions`. A restart is a page load with new settings. A replay, and opening an exported run, is a page load too, and `replay.ts` keeps its setup and Interventions, which don't fit in the URL, in the tab's session storage for that load. The worker sends Interventions to the viewer as the run reaches them, so a replay's show at their original steps.
- **The 3D view.** `roomScene.ts` builds the Room, its lighting, the food and water patches and the fly's place in it, `flyModel.ts` the procedural fly and its leg, wing and mouthpart movement, `fieldOverlay.ts` the overlay of the fields, `sourceDragging.ts` dragging food and water, and `views.ts` the monitoring and close-up cameras, the inset swap, the amber ring and the floor spot. `monitoringCamera.ts` frames the Room.
- **The panels.** `driverPanel.ts` draws the bars, red strips and flashes, `ribbon.ts` the ribbon, `timeControls.ts` the pause, speed and dial, and `runControls.ts` Disturb, the light menu, restart, replay, Room size, removing food and water, the field overlay's toggle and the export menu. `palette.ts` has their colours, names and icons.
- **The batch runner.** `src/batch` runs seeds without the viewer, in Node, which runs the engine's TypeScript itself once `resolveTypeScript.ts` adds the file extensions the engine's imports leave out. `cli.ts` is what `npm run batch` runs, `batchOptions.ts` reads and checks its options, `batch.ts` starts a process per seed, combines the tables and writes the manifest, `seedProcess.ts` is a seed's process, which writes its exports, and `simulateSeed.ts` runs a seed, keeping only the samples the export needs.
- **Validation.** `evidence/evidencePack.json` is the Evidence Pack, with its summary in [`evidence/README.md`](evidence/README.md), and `src/validation/evidencePack.ts` its schema, with `tuningPack`, the pack without its held-out targets, which is all tuning may read. `src/validation` holds the Virtual Assays, which run without the viewer. `assays.ts` sets up a study's Chamber and Light Schedule from its target, and runs a fly through it with given parameters and step size. `instruments.ts` has the instruments, which watch a run step by step through `pose` and `moving` and record only what a lab's could: the beam-crossing activity monitor, which counts crossings of each beam per bin, and video tracking, which compares frames for a change of position and, where its study counts it, grooming in place. `scoring.ts` scores an observation, and nothing else, into Inactivity Bouts, Activity Bouts and Scored Sleep. `measures.ts` and `targets.ts` work out a target's measure per fly and pooled, and judge it against its criterion. Beside the observation, `assays.ts` also records the fly's true Vigilance State, which only `disagreement.ts` reads, for Scoring Disagreement: lint stops the instruments, scoring, measures and targets importing it. `boutShapes.ts` tests bout shapes, with a Weibull likelihood-ratio test against the exponential, and `baseline.ts` and `targetBaselines.ts` fit the descriptive baseline, both with the search and grouping of durations in `fitting.ts`. `runValidation.ts` runs every counted target's study, a process per fly through `observeProcess.ts` and the batch's `processPool.ts`, runs the assays that score bouts at a second step size, and builds the report, whose format is in `report.ts`. The suite itself is in `validation/`, with its own `vitest.validation.config.ts`: `globalSetup.ts` runs the assays once and writes the report, `targets.validation.ts` makes each target a test, `boutShapes.validation.ts` makes each bout shape and step-size agreement a test, `awaitingTuning.ts` lists the targets the model doesn't meet yet, `tune.ts` runs the tuning pack with candidate parameters, and `restlessnessCandidate.json` holds the values #81's tuning found. In the engine, `relationships.ts` labels every parameter and Driver relationship Established, Provisional or Hypothesis, and lint stops the engine importing anything from validation. In the viewer, `validationView.ts` draws the report, with the targets' charts, `boutShapeChart.ts` and `baselineView.ts` the bout shapes and baseline, `disagreementChart.ts` Scoring Disagreement and `relationshipList.ts` the labels. `validationChart.ts` has what every chart is drawn with.
- **Tests.** `tests/engine` holds Vitest tests of the engine through `createSimulationRun`, and of its relationship labels in `relationships.test.ts`, `tests/batch` tests of the batch command, run as `npm run batch` runs it, and `tests/validation` tests of the assays' instruments, scoring, measures, runner, bout-shape test, descriptive baseline and Scoring Disagreement, on hand-built observations, samples drawn from known distributions and short runs. `e2e` holds Playwright tests of the app in Chromium, which observe a run through `window.flySim`, set up in `main.ts`, and of the validation view, on the report in `e2e/fixtures/validation-report.json`. Shared steps are in `e2e/helpers.ts`.

## Verify it

The first time, from the repo root, install the dependencies and the browser the tests use:

```powershell
npm ci
npx playwright install chromium
```

Then run every gate: formatting, lint with type-aware static analysis, type checks, engine and batch tests, dependency audit, build and browser tests.

```powershell
npm run verify
```

To run one test file, or only the tests whose names match some text:

```powershell
npx vitest run tests/engine/sleep.test.ts
npx vitest run tests/engine/sleep.test.ts -t "Sleep Depth"
npx playwright test e2e/room.spec.ts
npx playwright test e2e/timeControl.spec.ts -g "ribbon"
```

Playwright starts the dev server itself.

CI runs the same command on the only Node version it's tested with, and runs the [validation suite](#validate-the-model), `npm run validate`, as a job of its own beside it.

Exceptions:

- **Secret scanning** isn't part of it, as the app has no credentials or secrets. Review if it gains any.
- **`overrides.minimatch`** in `package.json` pins a patched version (GHSA-g3hv-75wg-m249), as ESLint's dependencies don't allow one yet. Remove it when `npm audit` passes without it.
