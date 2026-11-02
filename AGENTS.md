## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on barnabyg/flySim, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Code and verification

- **Code map:** what lives where in `src/`, `tests/` and `e2e/`, including the worker path every new run setting or command passes through. See the Code map section of `README.md`.
- **Verify:** install, single-test and full verification commands. See the Verify it section of `README.md`.
