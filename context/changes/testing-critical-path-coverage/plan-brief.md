# Critical-path coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

After a log, the owner must see a next-session suggestion they can skip, accept, or override, and those numbers must follow the locked increase/hold/deload rule. Today only the pure rule is unit-tested; the log→id parse, write-sets, and shown-row assembly are not. A hold invented from `default_load_kg` can disagree with the rule.

## Starting Point

Vitest + CI already run. One test file covers `suggestProgression`. Suggestion SSR coerces load only, then may fall back to plan default. Skip is a link; apply stores client kg. No jsdom/Playwright.

## Desired End State

Shown rows come from coerced finite sets through the locked rule, with unlogged/un-coercible lifts omitted. Missing `session.id` after 201 stays on the log form. Accept all vs Save payloads are unit-tested. Cookbook in `test-plan.md` §6 tells the next agent how to add a unit test without e2e.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| `default_load_kg` hold fallback | Remove; omit the lift | Shown kg must match the archive rule | Plan |
| Production vs tests | Extract helpers and fix coerce/fallback | Tests cannot hit Astro/React cheaply without helpers | Research + Plan |
| Test depth | Helpers + zod only | Cost × signal; Q5 no infra; no fake RLS | Research + Plan |
| Coerce reps | `Number()` like load_kg | Numeric-as-string lesson | Research + Plan |
| Session list → suggestion | Out of scope | Archive S-05 non-goal | Research + Plan |
| Apply recomputes rule | No | Override is FR-006; SQL stores client kg | Research |

## Scope

**In scope:** `logged-suggestions` helper; wire `suggestion.astro`; rule/builder tests; session-id helper; Accept/Save write-set helpers; apply schema tests; test-plan §6.

**Out of scope:** Playwright/jsdom; mocked POST/RPC; list deep links; risks #2–#4/#7; apply SQL math.

## Architecture / Approach

Pure functions in `src/lib/progression` and `src/lib/sessions`. Islands/pages call them. Oracles are archive arithmetic (`+ 2.5`, `× 0.9`), not function-output copies.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Shown-load contract | Coerce + omit builder; fallback gone; rule oracle tests | Empty suggestion list if all sets fail coerce |
| 2. Log id + write-set | session.id parse; Accept vs Save; zod | Treating Skip as an API |
| 3. Cookbook | test-plan §6 filled | Cookbook stays TBD |

**Prerequisites:** Existing Vitest/`npm test` CI (already wired).
**Estimated effort:** ~1 session across 3 phases (helpers + tests; cookbook last).

## Open Risks & Assumptions

- Empty suggestion UI when every logged set fails coerce is accepted.
- RPC write-set EXCEPT remains untested until a later test-plan phase.

## Success Criteria (Summary)

- Blank (unlogged) lifts do not appear as hold-from-default on the suggestion page
- Missing log `session.id` does not navigate as success
- Accept all ≠ Save when fields were edited, in unit tests
