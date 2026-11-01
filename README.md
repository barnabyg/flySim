# Fly Behaviour Simulator

A browser-based simulator for watching one adult male fruit fly live in a Room and seeing why it starts, continues and stops each behaviour. See [GLOSSARY.md](GLOSSARY.md) for domain terms and [docs/adr](docs/adr) for decisions.

Model values are roughly chosen to give watchable behaviour. They are Provisional and not validated.

## Run it

From the repo root, with Node 22.12 or later:

```powershell
npm start
```

This installs dependencies if needed, starts the app and opens it in your browser. Add `?seed=123` to the URL to choose the seed.

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
