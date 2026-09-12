---
date: 2026-08-31T18:33:38+02:00
researcher: 10x-research
git_commit: bbe4ca9266e46223893fdc138fd33cc9a17e43e5
branch: main
repository: JPawelka/ProgressApp
topic: "Ground test-plan Phase 1 (risks #1, #5, #6): log→suggestion, skip/accept/save, rule oracle"
tags: [research, codebase, progression, sessions, vitest]
status: complete
last_updated: 2026-08-31
last_updated_by: 10x-research
---

# Research: Ground test-plan Phase 1 (risks #1, #5, #6)

**Date**: 2026-08-31T18:33:38+02:00
**Researcher**: 10x-research
**Git Commit**: [bbe4ca9266e46223893fdc138fd33cc9a17e43e5](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5)
**Branch**: main
**Repository**: JPawelka/ProgressApp

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` (“Critical-path coverage”).

Risks to verify: #1, #5, #6.

Risk response guidance to verify, not blindly accept:

- #1: prove after a successful log the owner is offered increase/hold/deload + load for logged exercises; a missing session id does not silently skip that screen. Challenge “log success implies the suggestion loop ran.” Avoid e2e gym tour and using the current redirect string as the oracle.
- #5: prove skip leaves defaults unchanged; Accept all writes suggestions; Save writes field values; skipped lifts are not in the write set. Challenge “suggestion screen shown means loads were applied.” Avoid happy-path Accept all only.
- #6: prove decision + kg match the locked PRD/archive rule, not whatever is currently shown. Challenge “existing rule tests mean apply cannot be wrong.” Avoid implementation-mirror oracles.

Hot-spot directories (likelihood evidence, not anchors): `src/pages/sessions`, `src/components/sessions`, `src/lib/progression`, plus churn in `src/pages/api` / `src/lib/services`.

Stack: Vitest 4 + Astro `getViteConfig`, `environment: node`; one existing test file; CI/husky already run `npm test`.

## Summary

Phase 1 failures live on **three different seams**. A green `suggestProgression` suite does not protect the north-star loop.

1. **#1 is real.** `POST /api/plans/[id]/sessions` only persists and returns `{ session }` 201. The suggestion screen is a later GET of `/sessions/{id}/suggestion`. The client navigates there only if `session.id` is a non-empty string; otherwise it stays on the log form with an error. It does **not** fall back to `/sessions`. “201 ⇒ suggestion loop” is false. The session list has **no** link back to the suggestion URL, so a missed redirect is a dead end. Skipped lifts are omitted in `suggestion.astro` via `loggedIds`, not by the log API.

2. **#5 is real, but Skip is not a server invariant.** Skip is an `<a href="/sessions">` with no POST. Accept all POSTs original `suggested_load_kg`; Save POSTs parsed field values. The RPC `apply_progression_loads` requires the payload id-set to **equal** exercises that have `session_sets` on that session (symmetric EXCEPT). Testing “Skip leaves defaults unchanged” as an RPC behavior invents a write path that does not exist. Testing “partial skip of one lift on Save” invents UI the island does not offer.

3. **#6 is split.** Shown decision/kg come from `suggestProgression` after `Number(load_kg)` in `coerceSet`. Existing tests use **hand-derived spec literals** (`100+2.5`, `80×0.9`), not `expect(fn(x)).toEqual(fn(x))`. Apply **does not recompute the rule**; it stores client `load_kg` (override is intentional, FR-006). A second gap: if a lift is in `session_sets` but the rule returns nothing (all coerced sets dropped), the page synthesizes a **hold** from `default_load_kg` — that contradicts the archive “never read `default_load_kg`” rule and is untested.

**Cheapest layers (corrected):**

| Risk | Cheapest useful layer | Do not |
|------|------------------------|--------|
| #1 | Unit: 201 body `{ session: { id } }` contract helper + missing-id branch (extract `readSessionId` or test it as a pure helper). Handler test of POST export with mocked RPC returning a session. Do **not** e2e the gym loop. | Assert `window.location.href` string as product oracle; assume 201 opened the page |
| #5 | Unit: extract Accept-all vs Save write-set builders; zod `applyProgressionSchema` (min 1, unique ids, range). Optional: POST handler with mocked RPC for 200 vs 400 `Invalid loads`. Skip = assert no apply call (helper/module graph), not a DB test | Playwright; “Skip RPC”; partial-apply of unlogged lifts from the island |
| #6 | Keep/extend `progression-rule.test.ts` with contract-shaped expecteds (`100 + 2.5`); add non-finite drop + extract/test `coerceSet` (`"100"` → number). Do **not** treat apply 200 as proof of the rule | Regenerating expecteds from `suggestProgression`; claiming SQL enforces +2.5 |

**Existing tests:** only [`src/lib/progression/progression-rule.test.ts`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/lib/progression/progression-rule.test.ts). No tests for log API, `LogSessionForm`, `suggestion.astro`, `SuggestionForm`, apply schema/service/RPC.

**Speculative (do not invent safeguards as tests):** a log response that includes suggestions; Skip as a database no-op RPC; apply that re-runs increase/hold/deload. Test what exists.

**Hot-spot vs code:** §2 #1 cited `src/pages/sessions` + `src/components/sessions`. The 201/`session.id` seam is also `src/pages/api/plans/[id]/sessions.ts` and `src/lib/services/session-log.ts`. Likelihood evidence for #1 should include `src/pages/api` / session-log, not only sessions UI dirs. Failure location for planning is the files below — not a §2 file:line.

## Detailed Findings

### Risk #1 — Log success vs suggestion screen

**Persist (no suggestions).** [`src/pages/api/plans/[id]/sessions.ts`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/pages/api/plans/%5Bid%5D/sessions.ts#L29-L31) calls `logSession` and returns `json({ session }, 201)`. [`src/lib/services/session-log.ts`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/lib/services/session-log.ts) RPCs `log_training_session` and returns the `sessions` row (includes `id`). Failures map to 404/400/500 via `sessionLogFailure`; they never redirect.

**Client navigation.** [`LogSessionForm.tsx`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/components/sessions/LogSessionForm.tsx#L93-L181): `readSessionId` requires `data.session.id` to be a non-empty string. Missing id → `"Session saved but the suggestion page could not be opened"` and **stay**. Success → `window.location.href = `/sessions/${sessionId}/suggestion``. No success path to `/sessions`.

**SSR suggestion.** [`suggestion.astro`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/pages/sessions/%5Bid%5D/suggestion.astro#L36-L122): load session by id (RLS); load sets + plan exercises; coerce sets; `suggestProgression`; omit exercises not in `loggedIds`. Missing/inaccessible session → generic “does not exist or you do not have access” (no name leak). Set/exercise load error → “Could not load suggestions.” Auth: [`middleware.ts`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/middleware.ts#L4-L21) `PROTECTED_ROUTES` includes `/sessions` prefix (unauthenticated → `/auth/signin`). `/api/*` is **not** middleware-gated; APIs use `requirePlanApiAuth`.

**Re-entry gap.** [`src/pages/sessions/index.astro`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/pages/sessions/index.astro#L71-L78) lists sessions without linking to `/sessions/{id}/suggestion` (archive S-05 non-goal). If persist succeeds and navigation fails, the owner cannot reopen the loop from the list.

**Must-challenge result:** Log 201 does **not** imply the owner saw increase/hold/deload. Prove: (a) 201 JSON includes `session.id`; (b) missing id does not navigate away as success; (c) page omits unlogged lifts. Do not prove (a)+(b) by asserting the redirect URL as the product rule — the product rule is “owner is offered a suggestion,” which is the page’s `suggestions` + island, a second request.

### Risk #5 — Skip / Accept all / Save / write-set

**Island.** [`SuggestionForm.tsx`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/components/sessions/SuggestionForm.tsx):

- Skip: [`174-179`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/components/sessions/SuggestionForm.tsx#L174-L179) — `<a href="/sessions">`, no `fetch`.
- Save: [`78-88`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/components/sessions/SuggestionForm.tsx#L78-L88) — `completeLoad` on each field; invalid → error, no POST.
- Accept all: [`91-97`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/components/sessions/SuggestionForm.tsx#L91-L97) — `suggested_load_kg` from props, ignores edits.
- Submit: POST `/api/sessions/${sessionId}/progression` with `{ loads }`; 2xx → `/sessions`; error → stay.

Empty `suggestions` hides Save/Accept all; Skip remains.

**API.** [`progression.ts`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/pages/api/sessions/%5Bid%5D/progression.ts): `prerender = false`, `POST` only, `requirePlanApiAuth`, zod, `applyProgressionLoads`. Success `{ ok: true }` 200.

**Schema.** [`progression-apply-schema.ts`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/lib/progression/progression-apply-schema.ts): strict `{ loads: [{ plan_exercise_id uuid, load_kg 0–9999.99 }] }`, min 1, unique ids.

**RPC.** [`20260830221000_apply_progression_loads_rpc.sql`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/supabase/migrations/20260830221000_apply_progression_loads_rpc.sql#L19-L86): lock `sessions` where `id` and `user_id = auth.uid()`; empty array → `Empty loads`; payload vs `session_sets` must match both directions → `Invalid loads`; then `UPDATE plan_exercises.default_load_kg` only. No rule math.

**Must-challenge result:** Showing the suggestion page does not write defaults. Skip never calls apply (repo-wide, apply is only this POST). “Skipped lifts not in the write set” is: (1) UI does not include them in `suggestions`; (2) if a client forges an extra/omitted id, RPC 400. Do not plan a test that Save can omit a logged lift from the island — the island always posts **all** suggestion rows.

### Risk #6 — Locked rule vs shown vs applied

**Locked contract** (independent oracle): archive Phase 1 + PRD business logic — hits `reps >= default_reps`; all hit → heaviest + 2.5; all miss → heaviest × 0.9; mixed/null target → hold at heaviest; omit zero-set exercises; round 2dp; clamp `[0, 9999.99]`; coerce `load_kg` with `Number()`; **never** use current `default_load_kg` for the decision. Lesson: numeric columns are strings at the entity boundary ([`lessons.md`](../../foundation/lessons.md)).

**Pure function.** [`progression-rule.ts`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/lib/progression/progression-rule.ts): `INCREASE_KG = 2.5`, `DELOAD_FACTOR = 0.9`; drop non-finite reps/load; clamp suggested and heaviest.

**Existing tests.** [`progression-rule.test.ts`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/lib/progression/progression-rule.test.ts): nine cases covering the Phase 1 list (increase/deload/hold/null/omit+order/mixed loads/clamp/zero deload/rounding). Expecteds are literals (`102.5`, `72`, `74.25`) that match the arithmetic by hand — **not** an implementation mirror. Gap: literals are still the same numbers as the source constants; prefer `100 + 2.5` / `82.5 * 0.9` in the test file. Uncovered: non-finite drop; string `load_kg` coercion (lives in Astro `coerceSet`, [`suggestion.astro:25-33`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/pages/sessions/%5Bid%5D/suggestion.astro#L25-L33)); `reps` is **not** `Number()`’d.

**SSR drift.** [`suggestion.astro:70-88`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/pages/sessions/%5Bid%5D/suggestion.astro#L70-L88): if `loggedIds` has the exercise but `suggestProgression` omitted it, the page invents `decision: "hold"` from `default_load_kg`. That can show a load that is **not** from logged sets. Extracting `coerceSet` + testing the fallback as an explicit product decision (or deleting it) belongs in planning — it is a real #6 hole, not speculative.

**Apply.** Client kg only. Accept all posts whatever SSR put in `suggested_load_kg` (including the hold fallback). Save posts edits. Rule tests cannot catch a wrong Accept-all payload or a forged POST of 123 kg on an increase suggestion.

### Test infrastructure

- Config: [`vitest.config.ts`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/vitest.config.ts) `getViteConfig` + `environment: "node"`.
- `package.json` `"test": "vitest run"`; CI `.github/workflows/ci.yml` runs `npm test` after lint; husky runs `npm test`.
- No `*.spec.*`, no Testing Library, no jsdom. React islands are **not** mountable under the current env without adding a DOM project (out of Phase 1 cost × signal if helpers can be extracted).
- Astro 6: do not render `.astro` in jsdom. API `POST` exports **can** be called with a mocked `APIContext` in node.
- Shared API helpers: [`src/lib/plans/plan-api.ts`](https://github.com/JPawelka/ProgressApp/blob/bbe4ca9266e46223893fdc138fd33cc9a17e43e5/src/lib/plans/plan-api.ts) (`json`, `parseJsonBody`, `requirePlanApiAuth`). Used by sessions + progression APIs. `generate.ts` duplicates helpers (out of Phase 1).

## Code References

- `src/pages/api/plans/[id]/sessions.ts:29-31` — 201 `{ session }` only
- `src/components/sessions/LogSessionForm.tsx:93-100,176-181` — parse `session.id`; missing id stays; success navigates to suggestion
- `src/pages/sessions/[id]/suggestion.astro:25-33,60-88,104-121` — coerce, rule, skip omit, default_load fallback, not-found vs load-failed
- `src/pages/sessions/index.astro:71-78` — no suggestion deep link
- `src/middleware.ts:4-21` — `/sessions` auth gate; APIs ungated
- `src/components/sessions/SuggestionForm.tsx:57-97,147-179` — submit / save / acceptAll / Skip link
- `src/pages/api/sessions/[id]/progression.ts` — POST apply
- `src/lib/progression/progression-apply-schema.ts` — write-set shape
- `src/lib/services/progression-apply.ts` — RPC pass-through
- `supabase/migrations/20260830221000_apply_progression_loads_rpc.sql:19-94` — owner lock + exact logged-id set + client kg
- `src/lib/progression/progression-rule.ts` — locked math
- `src/lib/progression/progression-rule.test.ts` — only automated tests

## Architecture Insights

- **Session is committed before the north-star UI.** Suggestion is a read+compute of that session. Skip is navigation, not a compensating transaction.
- **Write-set is all-or-nothing at RPC**, whole logged-exercise set. UI never posts a subset.
- **Two numeric boundaries:** entities keep `load_kg` as `string | null`; calc uses `Number()` in Astro, not in the rule module.
- **Auth ≠ ownership.** Page RLS + RPC `auth.uid()`; `requirePlanApiAuth` only proves a user is logged in. Two-identity IDOR is Phase 3 (#3), not this change — do not mock RLS away if a later phase adds handler tests that need ownership.

## Historical Context (from prior changes)

- `context/archive/2026-08-29-progression-suggest-override/plan.md` — locked rule; 201 must parse `session.id` or stay with error; Skip = no write; apply RPC not N PATCHes; **no API tests beyond the pure rule**; CI `npm test`.
- Same plan Testing Strategy: integration “none automated”; RPC/RLS via manual verification.md steps.
- `context/foundation/lessons.md` — coerce numeric at calc/display only.
- `context/archive/2026-08-29-log-training-session/plan.md` — skipped lifts leave zero `session_sets`; incomplete sets not persisted (feeds #1 omit + #5 write-set).

## Related Research

No prior `research.md` in this repo (`context/changes/**` or `context/archive/**`).

## Test-plan corrections (for `/10x-test-plan` backport or `/10x-plan`)

Do **not** put file:line into §2. Suggested evidence/guidance edits only:

1. **#1 Source:** add hot-spot likelihood `src/pages/api` (log POST) alongside sessions UI dirs — the 201 contract is not only a page.
2. **#1 Response:** cheapest layer is unit/handler on `{ session.id }` + missing-id stay, plus page-level omit of unlogged lifts if a pure helper is extracted from `suggestion.astro`. Not “integration of the full log→browser loop.”
3. **#5 Response:** Skip = no apply call (client). Write-set equality = RPC/schema on POST. Do not describe Skip as a persist test.
4. **#6 Response:** Rule unit is necessary but insufficient for **applied** kg. Apply trusts the client. Shown kg can diverge via `default_load_kg` fallback — that is in-scope for Phase 1 if the phase claims “shown load obeys the locked rule.”
5. **Not speculative:** all three risks describe existing behavior that can already break.

## Open Questions

- Should the `default_load_kg` hold fallback in `suggestion.astro` be treated as a bug (align with archive: omit / error) or as product behavior to lock with an independent oracle? Planning should pick one; tests should not snapshot it as “whatever the page does” without that decision.
- Is a mocked-Supabase POST handler test in-scope for Phase 1, or only pure helpers + schema, leaving live RPC to Phase 2/3 (infra budget / interview Q5)?
- Coerce `reps` with `Number()` the same as `load_kg`? Today only load is coerced; if PostgREST stringifies ints, hit detection can silently fail.
