# Fly Behaviour Simulator

A browser-based simulator for watching one adult male fruit fly live in a Room and seeing why it starts, continues and stops each behaviour. See [GLOSSARY.md](GLOSSARY.md) for domain terms and [docs/adr](docs/adr) for decisions.

Model values are roughly chosen to give watchable behaviour. They are Provisional and not validated.

## Run it

From the repo root, with Node 22.12 or later:

```powershell
npm start
```

This installs dependencies if needed, starts the app and opens it in your browser. Add `?seed=123` to the URL to choose the seed.

## What you can do

- **Watch:** the fly acts on its own. Bars show what is pushing each transition, the red strip shows its chance of firing within the next simulated minute, and a flash marks each firing. Hover over a bar for numbers.
- **Time:** pause, resume or change the speed from 1× to 1000×. The ribbon at the bottom shows behaviour over the last 60 seconds of real time at the current speed.
- **Cameras:** drag the main view to orbit. The inset always tracks the fly, and clicking it swaps it with the main view. The fly is drawn at true scale, and the amber ring only marks where it is.

## Verify it

The first time, install the browser the tests use:

```powershell
npx playwright install chromium
```

Then run every gate: formatting, lint with type-aware static analysis, type checks, engine tests, dependency audit, build and browser tests.

```powershell
npm run verify
```

CI runs the same command. Secret scanning isn't part of it, as the app has no credentials or secrets.
