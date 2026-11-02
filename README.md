# Fly Behaviour Simulator

A browser-based simulator for watching one adult male fruit fly live in a Room and seeing why it starts, continues and stops each behaviour. See [GLOSSARY.md](GLOSSARY.md) for domain terms and [docs/adr](docs/adr) for decisions.

Model values are roughly tuned so that the behaviour is worth watching: over about 10 simulated minutes, a default run nearly always shows Immobility, grooming, walking and flight, a settled fly often stays still and awake for more than 5 minutes, and over a day the fly sleeps in a morning, siesta, evening and night pattern. They are Provisional and not validated, including flight speed and frequency, and all sleep, startle, light and clock values. A fly kept awake through the night sleeps more the next morning, which comes from its raised sleep pressure rather than a rule of its own.

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
- **Restart:** the circular arrow repeats the run with the same seed, and the die starts one with a new seed. The cube sets the Room's size, from 0.1 to 5 m in each direction, and restarts with the same seed. Your time speed is kept. All of this is in the page's URL as `seed`, `width`, `depth`, `height` and `speed`, for example `?seed=123&width=0.3&depth=0.5&height=0.2&speed=10`. A restart gives the run without any Disturb presses or schedule changes. Replaying them comes in phase 4.
- **Light schedule:** a run starts at lights-on, at 06:00, with 12 hours of light. The sun opens a menu that changes the schedule during the run: set the lights-on and lights-off times and press Set, or choose always on (sun) or always off (moon). The Room and the dial change at once, and the fly's activity responds at once, but its Circadian Clock takes days to follow, so darkness alone doesn't send it to sleep. While paused, a change takes effect when you resume. A restart goes back to the starting schedule. `lightHours` in the URL changes the starting hours of light, for example `?lightHours=0.05` for lights-off after 3 simulated minutes.

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
4. **Awake and still for minutes.** At 60×, a simulated minute is a real second. Now and then the fly stays blue, awake and motionless, for more than 5 seconds, which a lab would score as sleep. Thin violet slivers are sleep too short for a lab to score. When a long blue stretch ends with no input from you, the row that flashed shows what pushed it, and hovering over it gives the numbers.
5. **Deep sleep is harder to leave.** Hover over the moon row for a few minutes of sleep. Sleep Depth rises from near zero as the bar shrinks, and the ribbon's violet darkens.
6. **Disturb in light and deep sleep.** At 60×, press the lightning bolt in each of three states, and press the circular arrow to start again if you want to repeat one. Awake, the fly reacts at once. Lightly asleep (pale violet), it usually wakes. Deeply asleep (dark violet, most likely at night), it often sleeps on. Each press leaves a white line on the ribbon and an orange segment in the bars that holds for about a second. Paused, a press leaves its white line at once, and the bars jump only when you resume.
7. **Rebound after lost sleep.** Add `?seed=42&speed=1000` to the end of the page's address and press Enter. When the dial's hand reaches the bottom, at midnight and about a minute in, press and hold the lightning bolt until it reaches 06:00, about 20 seconds later. The ribbon fills with white lines instead of violet, and in the row that ends in a moon, the blue sleep pressure segment grows longer than it gets on a normal night. Let go and watch the morning: there is more violet than usual over the next few hours, and it fades back to the normal pattern by the next day. Press the circular arrow to see the same run without your presses, with less violet that morning.
8. **Changing the light schedule.** At 1000×, press the sun beside the cube and then the moon in its menu, for always off. The Room dims and the dial goes dark at once, and the pale light segment leaves the bars at once, so the fly is a little less likely to start walking. But it doesn't simply sleep: its clock keeps running, so the next day still has an active morning, a siesta and a sleepy night at the usual times. Press the circular arrow to start again, then use the sun's menu to set lights-on to 12:00 and lights-off to 00:00 and press Set. The Room follows the new times at once, while the violet of the night moves later bit by bit over the following days rather than jumping.
9. **Reproducible.** The circular arrow repeats the run without your presses and schedule changes, and the fly does the same things at any speed.

Sleep's timing, the rebound and the light schedule's effects are rough tunings, so feedback on how they look is useful.

## Verify it

The first time, install the browser the tests use:

```powershell
npx playwright install chromium
```

Then run every gate: formatting, lint with type-aware static analysis, type checks, engine tests, dependency audit, build and browser tests.

```powershell
npm run verify
```

CI runs the same command on the only Node version it's tested with.

Exceptions:

- **Secret scanning** isn't part of it, as the app has no credentials or secrets. Review if it gains any.
- **`overrides.minimatch`** in `package.json` pins a patched version (GHSA-g3hv-75wg-m249), as ESLint's dependencies don't allow one yet. Remove it when `npm audit` passes without it.
