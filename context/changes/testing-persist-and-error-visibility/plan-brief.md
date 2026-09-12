# Persist completeness and error visibility — Plan Brief

> Full plan: `context/changes/testing-persist-and-error-visibility/plan.md`
> Research: `context/changes/testing-persist-and-error-visibility/research.md`

## What & Why

Lock tests (and one generate UX fix) so a “successful” save cannot hide missing rows, and generate/log/apply failures cannot look like success. Test-plan Phase 2 risks #2 and #4.

## Starting Point

Vitest `node` already covers suggestion/write-set helpers (Phase 1). Log omit, log/apply `{ error }` mapping, generate two-step persist, and generate `ok` without `planId` are untested. No jsdom.

## Desired End State

Incomplete log drafts are omitted; incomplete POST bodies fail zod. Failed persist maps to a visible `{ error }`. Generate missing `planId` stays with an error. Exercise-insert failure throws and attempts plan delete. Cookbook §6.2 / §6.5 tell the next agent not to add Playwright.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Missing generate `planId` | Product fix: stay + error | Same contract as log missing `session.id`; must not snapshot silence as success | Plan |
| Persist proof for generate | In-process fake Supabase client | Only seam that can leave incomplete data; no mock framework, no live DB | Plan / Research |
| Session #2 surface | Schema + `sessionLogFailure` + extract omit builder | Client omit vs server reject are both real | Plan / Research |
| Risk #4 layer | Shared `errorMessageFromBody` + `planIdFromGenerateResponse` | Node units; islands stay unmounted | Plan / Research |
| Apply | `progressionApplyFailure` tests; skip re-testing zod | Schema already exists; mapper was the gap | Plan |
| Cookbook | Fill §6.2 / §6.5 + §2 backports in last phase | Orchestrator cookbook contract | Plan |

## Scope

**In scope:** Log completeness helpers/tests; error/success parsers; generate stay-with-error; export `persistGeneratedPlan` + fake-client tests; apply failure mapper; test-plan cookbook.

**Out of scope:** Playwright/jsdom; live RPC/SELECT; IDOR; plan-edit races; OpenRouter; apply schema redo; POST handler `APIContext` suite.

## Architecture / Approach

Extract pure `src/lib/` helpers (Phase 1 pattern), wire existing islands, fake only the generate persist chain, document cookbook.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Session completeness | Omit builder + zod + log failure mapper | Divergent `isCompleteSet` left in the island |
| 2. Error visibility | Shared parse helpers + generate `planId` fix | Copy/navigate mismatch vs log |
| 3. Persist fake + apply + cookbook | Compensating-delete proof; §6 filled | Fake client too coupled to Supabase chain shape |

**Prerequisites:** Phase 1 of the test rollout archived; `npm test` green.
**Estimated effort:** ~3 implement sessions (one phase each).

## Open Risks & Assumptions

- Fake client must track `from().insert().select().single()` as written; if persist is refactored, tests update with it.
- Orphan-on-failed-delete remains a 500, not a product fix in this change.

## Success Criteria (Summary)

- Incomplete log rows are not in the POST body; incomplete POSTs fail schema.
- Generate without `planId` shows an error and does not redirect.
- Generate persist failure throws and attempts delete; apply errors map to 4xx/5xx copy.
