# Fly Behaviour Simulator

A browser-based simulator for watching one adult male fruit fly live in a Room and seeing why it starts, continues and stops each behaviour. See [GLOSSARY.md](GLOSSARY.md) for domain terms and [docs/adr](docs/adr) for decisions.

Model values are roughly tuned so that the behaviour is worth watching: over about 10 simulated minutes, a default run nearly always shows Immobility, grooming, walking and flight. They are Provisional and not validated, including flight speed and frequency.

## Run it

From the repo root, with Node 24 or later:

```powershell
npm start
```

This installs dependencies if needed, starts the app and opens it in your browser.

## What you can do

- **Watch:** the fly acts on its own. Bars show what is pushing each transition, the red strip shows its chance of firing within the next simulated minute, and a flash marks each firing. Hover over a bar for numbers.
- **Time:** pause, resume or change the speed from 1× to 1000×. The ribbon at the bottom shows behaviour over the last 60 seconds of real time at the current speed.
- **Cameras:** drag the main view to orbit. The inset always tracks the fly, and clicking it swaps it with the main view. The fly is drawn at true scale, and the amber ring only marks where it is. A dark spot on the floor shows where the fly is above the floor. It is a marker of a fixed size, as a true-scale shadow would be too small to see.
- **Restart:** the circular arrow repeats the run with the same seed, and the die starts one with a new seed. The cube sets the Room's size, from 0.1 to 5 m in each direction, and restarts with the same seed. Your time speed is kept. All of this is in the page's URL, so a run can be bookmarked.

## Test phase 1

Run `npm start` from the repo root, as above, and then:

1. **It lives on its own.** Watch for a minute at the default 60×. The fly moves around with no input, and the ribbon fills with four colours: blue for Immobility, green for grooming, amber for walking and pink for flight. Flights are short, so pink shows as thin slivers. If you see no pink after about 10 simulated minutes (10 real seconds at 60×), press the die for another run.
2. **It looks like a fly.** Click the inset to fill the main view with the close-up, and set the speed slider to 1×. You should see a body, head, red eyes, wings and six jointed legs.
3. **Its movement matches what it's doing.** Still in the close-up, compare the fly with the bright row in the side panel, raising the speed to find each behaviour and dropping it to 1× or 2× to look. At 60× and above, legs and flights go by too fast to read, and the ribbon carries the story.
   - Walking: the legs step in alternating sets of three.
   - Immobility: nothing moves at all.
   - Grooming: only the two front legs rub together under the head, and the fly stays where it is.
   - Flight: the wings become a blur, the legs tuck in and the fly travels through the air. Its wings are at rest in every other behaviour.
4. **It goes everywhere.** Click the inset to go back to the wide view, and watch at 120× or more. The fly lands on, and walks over, the floor, walls and ceiling, and it stays upside down on the ceiling with its feet on the surface. Off the floor, a dark spot on the floor marks the point below it.
5. **Bars match what it does.** Each row of the side panel is one possible transition. Its bar shows what is pushing it, its red strip brightens as firing becomes more likely, and it flashes when it fires. The behaviour then changes to match. Hover over a row for numbers.
6. **Time speed changes nothing.** Note what the ribbon does, press the circular arrow and watch again at another speed. The run is the same, only faster or slower.
7. **Restart and Room size.** The circular arrow gives the same run again, and the die gives a different one. In the cube's form, set a Room of 0.3 × 0.5 × 0.2 m and press Restart: the view reframes to the new Room, and the fly stays inside it.

Tell us whether it looks and feels right. How often the fly does each thing is a rough tuning, so that is useful feedback too.

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
