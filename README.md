# Fly Behaviour Simulator

A browser-based simulator for watching one adult male fruit fly live in a Room and seeing why it starts, continues and stops each behaviour. See [GLOSSARY.md](GLOSSARY.md) for domain terms and [docs/adr](docs/adr) for decisions.

Model values are roughly tuned so that the behaviour is worth watching: over about 10 simulated minutes, a default run nearly always shows Immobility, grooming, walking and flight, a settled fly often stays in awake Immobility for more than 5 minutes, and over a day the fly sleeps in a morning, siesta, evening and night pattern. They are Provisional and not validated, including flight speed and frequency, and all sleep, startle, light and clock values. A fly kept awake through the night sleeps more the next morning, which comes from its raised sleep pressure rather than a rule of its own.

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
- **Export:** the download arrow exports the run you are watching as a gzipped JSON file, named with its seed and how far the run has got in simulated seconds, such as `fly-sim-seed-42-at-3600s.json.gz`. Choose how many simulated seconds apart its samples are first, 10 by default. The file alone is enough to trace and reproduce the run: see [Exported runs](#exported-runs).
- **Food and water:** the straw-yellow patch towards the south-west corner is food and the blue patch towards the north-east corner is water. The fly can feed or drink only while standing on one, and it finds them by following odour and humidity, so it can miss one that is out of range. The ribbon shows feeding in vermilion and drinking in cyan, and the bars show Hunger, Thirst, Odour and Humidity. `food` and `water` in the URL set where they start, in metres from the west and south walls, and `energy` and `hydration` how full the fly's reserves start, from 0.01 to 1, for example `?food=0.2,0.3&water=0.8,0.7&hydration=0.1`.
- **Fields:** the wavy-lines button shows what the fly could detect: the Odour Field in olive and the Humidity Field in pale blue, each fading out to a faint dome where its range ends.
- **Moving food and water:** drag a patch across the floor of the main view to move it. Dragging a patch doesn't orbit the camera. Its field moves with it, but the fly only finds out when it senses the new place.
- **Removing food or water:** the dish and drop buttons take the food or water away and put it back. Without it, the matching reserve keeps falling, the fly weakens, and when a reserve runs out it dies: a banner says so, and the ribbon and bars stop. Restart and the die still work.
- **Light schedule:** a run starts at lights-on, at 06:00, with 12 hours of light. The sun opens a menu that changes the schedule during the run: set the lights-on and lights-off times and press Set, or choose always on (sun) or always off (moon). The Room and the dial change at once, and the fly's activity responds at once, but its Circadian Clock takes days to follow, so darkness alone doesn't send it to sleep. While paused, the Room and dial change at once, and the fly gets the change when you resume. A restart goes back to the starting schedule. `lightHours` in the URL changes the starting hours of light, for example `?lightHours=0.05` for lights-off after 3 simulated minutes.

## Exported runs

An export is a gzipped JSON file that holds everything needed to trace and reproduce a run. Its fields are:

| Field                                            | What it holds                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`                                         | Always `"fly-sim-run"`.                                                                                                                                 |
| `recordFormatVersion`                            | The version of the file's layout, now 1.                                                                                                                |
| `modelVersion`                                   | The model that made the run. Another model version might not reproduce it.                                                                              |
| `seed`, `triggerStream`                          | The run's seed, and which random stream drew its Trigger Levels.                                                                                        |
| `stepsPerSecond`                                 | The model's steps per simulated second, 50.                                                                                                             |
| `room`                                           | The Room's size in metres.                                                                                                                              |
| `parameters`                                     | Every model parameter, including `initialEnergy` and `initialHydration`, how full the reserves started.                                                 |
| `food`, `water`                                  | Where each started, in metres from the west and south walls, or `null` for none.                                                                        |
| `lightSchedule`                                  | The schedule the run started with. Changes to it are among the Interventions.                                                                           |
| `step`, `death`                                  | The step the run had reached, and how and when the fly died, or `null`.                                                                                 |
| `interventions`                                  | Every Intervention, with the step it applied at.                                                                                                        |
| `firedTransitions`                               | Every fired transition, with its Trigger Level, its hazard and Driver contributions, and the fly's state when it fired.                                 |
| `timeOnSurfaceSeconds`, `timeInBehaviourSeconds` | Totals over the whole run.                                                                                                                              |
| `sampleIntervalSeconds`, `samplesStartSeconds`   | How many simulated seconds apart the samples are, and when the run's samples start.                                                                     |
| `samples`                                        | The fly's full state at every multiple of the interval: behaviour, Vigilance State, position, reserves, Drivers and each available transition's hazard. |

Samples are thinned, as a full-detail record is about 170 MB of JSON per simulated day, but fired transitions and Interventions never are, so bout durations come out exact. A long viewer run keeps only about its latest two simulated days of samples, and `samplesStartSeconds` then says where they start. The setup and Interventions still cover the whole run, so the full-detail run can always be regenerated from the file, with `createSimulationRun(replaySetup(file))` advanced by `file.step` steps.

Python reads it with its own modules:

```python
import gzip, json

with gzip.open("fly-sim-seed-42-at-3600s.json.gz", "rt") as file:
    run = json.load(file)

print(run["seed"], run["modelVersion"], len(run["firedTransitions"]))
bouts = [(each["step"], each["from"], each["to"]) for each in run["firedTransitions"]]
```

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

## Code map

- **`src/engine`** is the model, with no rendering or UI code. Lint stops it importing three.js or the viewer. Its one interface is `createSimulationRun` in `simulationRun.ts`, re-exported from `index.ts`: give it a setup, advance it, intervene and read its Run Record. `model.ts` has the behaviours, Drivers and transitions, including Hunger, Thirst, steering by odour and humidity, and weakening. `parameters.ts` has the model's parameters and their defaults, including the reserves' rates. `physiology.ts` has the per-step state updates: arousal, Sleep Pressure, Sleep Depth, the Circadian Clock, Startle, the Energy and Hydration Reserves, and what the fly has sensed lately. `simulationRun.ts` sets up and steps the run, fires transitions, moves the fly, applies Interventions, ends the run on death and keeps the Run Record, and its `replaySetup` gives the setup that replays a recorded run. `setupOptions.ts` turns the setup choices the experimenter has, in the viewer's URL or a batch's command, into a setup. `runExport.ts` converts a Run Record into the export format, reads exports back, and holds the record format version. `roomContents.ts` holds the Room's contents: where the food and water are, whether they are there, contact with them, and the Odour and Humidity Fields. `movement.ts` has the fly's movement over the Room's surfaces, `lightSchedule.ts` the Light Schedule and `random.ts` the seeded random streams.
- **The worker path.** The engine runs in a Web Worker, so a new run setting or command has to pass through all four of `src/viewer/protocol.ts` (the messages), `simulationWorker.ts` (owns the Simulation Run), `simulationClient.ts` (the viewer's side) and `main.ts` (wires the viewer together). Replay and export go this way too: the worker hands back a replay's setup, and builds and gzips an export itself, with `gzip.ts`, so a long run's record never has to cross to the page. `download.ts` saves the files.
- **Settings, restart and replay.** `runSettings.ts` reads and writes a run's settings in the URL, including where the food and water start and how full the reserves start, and turns them into a setup through the engine's `setupFromOptions`. A restart is a page load with new settings. A replay is a page load too, and `replay.ts` keeps its setup and Interventions, which don't fit in the URL, in the tab's session storage for that load. The worker sends Interventions to the viewer as the run reaches them, so a replay's show at their original steps.
- **The 3D view.** `roomScene.ts` builds the Room, its lighting, the food and water patches and the fly's place in it, `flyModel.ts` the procedural fly and its leg, wing and mouthpart movement, `fieldOverlay.ts` the overlay of the fields, `sourceDragging.ts` dragging food and water, and `views.ts` the monitoring and close-up cameras, the inset swap, the amber ring and the floor spot. `monitoringCamera.ts` frames the Room.
- **The panels.** `driverPanel.ts` draws the bars, red strips and flashes, `ribbon.ts` the ribbon, `timeControls.ts` the pause, speed and dial, and `runControls.ts` Disturb, the light menu, restart, replay, Room size, removing food and water, the field overlay's toggle and the export menu. `palette.ts` has their colours, names and icons.
- **Tests.** `tests/engine` holds Vitest tests of the engine through `createSimulationRun`. `e2e` holds Playwright tests of the app in Chromium, which observe a run through `window.flySim`, set up in `main.ts`. Shared steps are in `e2e/helpers.ts`.

## Verify it

The first time, from the repo root, install the dependencies and the browser the tests use:

```powershell
npm ci
npx playwright install chromium
```

Then run every gate: formatting, lint with type-aware static analysis, type checks, engine tests, dependency audit, build and browser tests.

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

CI runs the same command on the only Node version it's tested with.

Exceptions:

- **Secret scanning** isn't part of it, as the app has no credentials or secrets. Review if it gains any.
- **`overrides.minimatch`** in `package.json` pins a patched version (GHSA-g3hv-75wg-m249), as ESLint's dependencies don't allow one yet. Remove it when `npm audit` passes without it.
