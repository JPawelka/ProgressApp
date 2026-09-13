---
date: 2026-09-12T19:03:45+02:00
researcher: 10x-research
git_commit: ac1bd5d9b3f6fb90ff1144eeee113baf28c5c713
branch: main
repository: JPawelka/ProgressApp
topic: "Ground test-plan Phase 2 (risks #2, #4): persist completeness and generate/log/apply error visibility"
tags: [research, codebase, persist, sessions, plans, vitest, islands]
status: complete
last_updated: 2026-09-12
last_updated_by: 10x-research
---

# Research: Ground test-plan Phase 2 (risks #2, #4)

**Date**: 2026-09-12T19:03:45+02:00
**Researcher**: 10x-research
**Git Commit**: [ac1bd5d9b3f6fb90ff1144eeee113baf28c5c713](https://github.com/JPawelka/ProgressApp/blob/ac1bd5d9b3f6fb90ff1144eeee113baf28c5c713)
**Branch**: main
**Repository**: JPawelka/ProgressApp

Code permalinks below use pushed `origin/main` ([562da636ceb9b8c34d375fb1ff1c9c097aa7800a](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a)); workspace HEAD is one local archive commit ahead.

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` (“Persist and error visibility”).

Risks to verify: #2, #4.

Risk response guidance to verify, not blindly accept:

- #2: prove failed or partial persist is visible as failure; complete sets that should save are present; incomplete sets are not treated as a full session. Challenge “Success status means the workout exists as entered.” Avoid re-testing the database engine and mirroring handler internals.
- #4: prove a non-success / error payload from generate, log, or apply is shown and the form does not look like success. Challenge “If the island is still mounted, the user saw the error.” Avoid pixel snapshots and Playwright for layout.

Hot-spot directories (likelihood evidence, not anchors): `src/lib/services`, `src/pages/api` (scope: `src`, `supabase/migrations`).

Stack: Vitest via Astro `getViteConfig`, `environment: node`; `npm test` = `vitest run`; no API mocking stack; no e2e; no jsdom / Testing Library.

## Summary

Phase 2 failures are **not one persist bug**. Session log, plan generate, and apply have different atomicity stories. Error visibility is mostly wired for HTTP failures, with one real silent-success hole on generate.

1. **#2 is real, but “as entered” is not the product rule.** The log island **omits** blank and invalid drafts before POST ([`LogSessionForm.tsx:70-83,129-154`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/components/sessions/LogSessionForm.tsx#L70-L154)). The server **rejects** incomplete elements (zod + RPC); it does **not** drop them and 201. RPC [`log_training_session`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/supabase/migrations/20260829121500_log_training_session_rpc.sql) inserts **all** `p_sets` in one transaction and returns the **`sessions` row only** — 201 `{ session }` cannot prove set rows exist. Skipped lifts → zero `session_sets` **by design**. “Full session = every plan exercise logged” **does not exist**.

2. **Plan generate is the only designed incomplete-data hole.** [`persistGeneratedPlan`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/lib/services/plan-generation.ts#L61-L112) is two inserts, not one RPC. Exercise insert failure always throws `PlanPersistError` (HTTP 500), and attempts a compensating `plans` delete. If that delete fails (or the process dies between inserts), an **orphan plan with 0 exercises** can remain **while the client already saw failure**. `200 { planId }` is only returned after both inserts succeed. Apply `200 { ok: true }` is all-or-nothing for the posted load set (symmetric EXCEPT vs `session_sets`). Plan edit is per-resource; `lessons.md` count-then-mutate is **concurrency-only and stale** (add/delete already use cardinality RPCs).

3. **#4 is real for generate’s ok-without-`planId`; log/apply HTTP errors already set `ServerError`.** Three islands POST generate/log/apply. All APIs use `{ error: string }` (optional unused `details`). Log and Suggestion: `!ok` → `readError` → `setError`. Generate: `!ok` → `setError`, but **`ok` with missing `planId` neither errors nor navigates** ([`GeneratePlanForm.tsx:28-36`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/components/plans/GeneratePlanForm.tsx#L28-L36)). **“Island still mounted ⇒ user saw the error” is false.** `ServerError` renders the string or nothing ([`ServerError.tsx:9-10`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/components/auth/ServerError.tsx#L9-L10)); no `role="alert"`. Proving pixels is worthless; proving **handlers set a message / stay vs navigate** is the signal.

**Cheapest layers (corrected):**

| Risk | Cheapest useful layer | Do not |
|------|------------------------|--------|
| #2 session | Unit: `logSessionSchema` (empty, incomplete element, dup keys); `sessionLogFailure` mapping; extract/test log payload builder (omit + renumber). SQL read of RPC: no skip-filter, returns `sessions` only | Live `SELECT session_sets`; claiming 201 means all UI rows saved; “all exercises must be logged” |
| #2 generate | Unit/mocked service: exercise insert error → throw, no `planId`; compensating `delete` invoked | Re-testing Postgres multi-row INSERT; Gemini; Playwright generate tour |
| #2 apply | Already have `applyProgressionSchema` tests. Add: `progressionApplyFailure` mapping. Optional mocked RPC: extra/missing id → throw, never success | Asserting SQL EXCEPT by executing Postgres; IDOR (Phase 3) |
| #4 | Extract `planIdFromGenerateResponse` (mirror `sessionIdFromLogResponse`) so missing id is stay-with-error; extract shared `errorMessageFromBody`; unit under `environment: node` | jsdom island mount; pixel snapshots; Playwright; testing `ServerError` CSS |

**Existing tests:** five files, all `src/lib/**/*.test.ts` — rule, coerce/omit suggestions, write-set, apply schema, log `session.id`. **None** for `session-log-schema`, `sessionLogFailure`, `plan-generation` persist, generate `planId` parse, or `readError`.

**Hot-spot vs code:** §2 #2 citing `src/lib/services` + `src/pages/api` is fair. #4 has **no** hot-spot citation; failure lives in **islands** (`src/components/plans`, `src/components/sessions`) plus generate’s success-body contract. Likelihood evidence for #4 should include those UI dirs if backporting — still **not** file:line in §2.

**Not speculative:** incomplete UI rows omitted on log; generate two-step orphan-on-failed-rollback; generate silent ok-without-id. **Speculative (do not invent):** server drops incomplete sets then 201s; apply partial `default_load_kg` on 200; count-then-mutate as Risk #2 incomplete save.

## Detailed Findings

### Risk #2 — Session persist completeness

**Persist boundary.** Island filters drafts → `POST /api/plans/[id]/sessions` ([`sessions.ts:8-31`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/pages/api/plans/%5Bid%5D/sessions.ts#L8-L31)) → `logSessionSchema` → `logSession` RPC `log_training_session` → 201 `{ session }`. Failures: auth 401/503, 400 invalid JSON/zod/RPC validation, 404 not found, 500 generic `"Failed to save session"` ([`sessionLogFailure`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/lib/services/session-log.ts#L42-L54); persist text only in `console.error`).

**Completeness rule (product).** Complete set = uuid `plan_exercise_id` + `set_number` 1–8 + `reps` 1–100 + `load_kg` 0–9999.99. ≥1 set required. Archive `2026-08-29-log-training-session`: blanks not stored; skipped exercises zero rows. Implementation: **client omits** incomplete (`isCompleteSet`); **server rejects** incomplete (zod `.strict()` + RPC `Invalid sets` / `Empty sets`) rather than dropping. Unique `(plan_exercise_id, set_number)` on payload (zod refine + RPC).

**RPC atomicity.** [`20260829121500_log_training_session_rpc.sql:1-2,75-99`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/supabase/migrations/20260829121500_log_training_session_rpc.sql#L1-L2) — lock plan; validate all elements; insert session; insert **every** `p_sets` element; `RETURN created` = sessions row. Mid-loop failure rolls back. **Cannot 201 with a subset of the requested `p_sets`.** Can 201 with a subset of **form** rows because the client never sent them.

**Must-challenge result:** “Success means the workout exists as entered” is **false** for WYSIWYG form rows (invalid filled rows silently omitted). **True** only for: posted complete `sets` all land or the call fails. 201 body does not include `session_sets`, so the client cannot verify row completeness from the success JSON.

**Lesson prior:** numeric `load_kg` is `string | null` at entities; write path uses numbers in the JSON body (zod). Coerce-on-read is not this phase’s persist hole.

### Risk #2 — Plan generate and apply

**Generate.** [`generate.ts:56-67`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/pages/api/plans/generate.ts#L56-L67) returns `{ planId }` 200 only after `generateAndPersistPlan`. Persist is **not** an RPC: insert `plans`, then insert `plan_exercises`; on child error, delete plan then throw ([`plan-generation.ts:92-112`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/lib/services/plan-generation.ts#L92-L112)). Zod AI payload requires 3–8 exercises before write. Archive `2026-08-16-ai-plan-from-goal` impl-review already flagged two-step persist + unchecked compensating delete. **200 never means “plan without exercises.”** Incomplete data appears on **failure** (orphan + 500).

**Apply.** [`progression.ts`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/pages/api/sessions/%5Bid%5D/progression.ts) → `applyProgressionLoads` → RPC. Symmetric EXCEPT: payload ids must equal logged `session_sets` exercise ids; each `UPDATE` must `FOUND` or `Not found`. Transaction: no partial `default_load_kg` on success. Unlogged lifts keep old defaults **by design** (Phase 1). Schema already unit-tested.

**Plan edit.** Add/delete go through `add_plan_exercise` / `delete_plan_exercise` (lock + count). Not a Risk #2 “looked successful, missing fields” path. Do not reopen concurrency cardinality here.

### Risk #4 — Error payload vs island render

**APIs.** Shared `{ error: string }`. Zod 400s add `details` (islands ignore). Generate duplicates local `json()` instead of `plan-api.ts`. Generate persist 500 **leaks** `PlanPersistError.message`; log/apply 500s are generic.

**Islands (only POST surfaces for generate/log/apply).**

| Island | `!ok` | Network / bad JSON | Success without required id | Success UX |
|--------|-------|--------------------|-----------------------------|------------|
| `GeneratePlanForm` | `data.error ?? "Failed to generate plan"` | catch `"Failed to generate plan"` | **silent** (`if (data.planId)` only) | `/plans/{id}` |
| `LogSessionForm` | `readError` | `"Failed to save session"`; ok+unparseable JSON → stay with copy | `sessionIdFromLogResponse` null → stay with copy (Phase 1) | `/sessions/{id}/suggestion` |
| `SuggestionForm` | `readError` | `"Failed to save progression"` | n/a — `ok` navigates **without** reading `{ ok: true }` | `/sessions` |

`readError` is duplicated in Log, Suggestion, `EditPlanForm` ([`LogSessionForm.tsx:85-92`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/components/sessions/LogSessionForm.tsx#L85-L92), [`SuggestionForm.tsx:26-33`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/src/components/sessions/SuggestionForm.tsx#L26-L33)).

**Must-challenge result:** Mounted after settle does **not** imply an error string. Generate ok-without-`planId` is the concrete counterexample. Log/apply `!ok` paths do set error before `finally` clears pending. In-flight spinner is not fake success.

**Cookbook implication for §6.5:** pattern is “extract parse/outcome helpers next to `src/lib/` and unit-test failed-fetch **body contracts**,” not mount the island.

### Test infrastructure

- [`vitest.config.ts`](https://github.com/JPawelka/ProgressApp/blob/562da636ceb9b8c34d375fb1ff1c9c097aa7800a/vitest.config.ts): `environment: "node"`.
- `package.json` `"test": "vitest run"`; husky + CI. No `@testing-library/react`, no `jsdom`.
- Handler `POST` can be called with mocked `APIContext` in node (Phase 1 research). Cost × signal: prefer schemas + exported failure mappers + extracted client parsers over first handler mock stack unless generate persist needs a fake Supabase client.
- `throwFromRpcMessage` in session-log / progression-apply is **private**; test via exported `*Failure` + error classes, or export for tests.

## Code References

- `src/pages/api/plans/[id]/sessions.ts:8-31` — log POST; 201 `{ session }`
- `src/lib/sessions/session-log-schema.ts:2-23` — complete-set contract; min 1; unique keys
- `src/lib/services/session-log.ts:31-72` — RPC pass-through; `sessionLogFailure`
- `supabase/migrations/20260829121500_log_training_session_rpc.sql` — atomic insert; no skip-filter
- `src/components/sessions/LogSessionForm.tsx:70-83,85-92,125-184` — omit incomplete; `readError`; stay vs navigate
- `src/pages/api/plans/generate.ts:10-67` — local `json`; `{ planId }` vs `{ error }`
- `src/lib/services/plan-generation.ts:61-112` — two-step persist + compensating delete
- `src/components/plans/GeneratePlanForm.tsx:16-41` — silent ok-without-`planId`
- `src/pages/api/sessions/[id]/progression.ts` — apply POST `{ ok: true }`
- `src/lib/services/progression-apply.ts:25-70` — RPC; `progressionApplyFailure`
- `supabase/migrations/20260830221000_apply_progression_loads_rpc.sql:70-99` — set equality + all-or-nothing UPDATE
- `src/components/sessions/SuggestionForm.tsx:26-57` — `readError`; navigate on any `ok`
- `src/components/auth/ServerError.tsx:9-25` — null if no message; otherwise text
- `src/lib/plans/plan-api.ts:5-36` — shared `json` / `parseJsonBody` / `requirePlanApiAuth`
- `vitest.config.ts:4-6` — node environment

## Architecture Insights

- **Session commit is one RPC; generate persist is two table writes.** Completeness tests must not treat them as the same seam.
- **201/200 bodies are thin** (`session` / `planId` / `{ ok: true }`). Completeness of child rows is a **server invariant**, not something the island can assert from JSON.
- **Client omit vs server reject** both exist on log. Tests that encode “server drops incomplete and succeeds” would lock a behavior that is not implemented.
- **Error UX is `setError` + `ServerError`, not ARIA.** Contract = non-empty message on failure paths + no navigate. Accessibility attributes are out of this risk (and interview Q5 UI looks).
- **Auth ≠ ownership** still true; two-identity tests wait for Phase 3.

## Historical Context (from prior changes)

- `context/archive/2026-08-31-testing-critical-path-coverage/research.md` — Phase 1: log 201 does not imply suggestion UI; Skip is not a persist test; apply stores client kg. Left open: mocked POST vs pure helpers for later phases.
- `context/archive/2026-08-29-log-training-session/plan.md` — complete-only persist, ≥1 set, skipped lifts zero rows; generic 500 to client.
- `context/archive/2026-08-16-ai-plan-from-goal/plan.md` + `reviews/impl-review.md` — AI then persist; compensating delete; raw persist errors to client.
- `context/archive/2026-08-29-progression-suggest-override/plan.md` — no API tests beyond the rule (Phase 1 filled helpers only).
- `context/foundation/lessons.md` — count-then-mutate (stale vs current RPCs); numeric-as-string at entity boundary.

## Related Research

- `context/archive/2026-08-31-testing-critical-path-coverage/research.md` — Phase 1 grounding (#1, #5, #6).

## Test-plan corrections (for `/10x-test-plan` backport or `/10x-plan`)

Do **not** put file:line into §2. Suggested evidence/guidance edits only:

1. **#2 Response:** cheapest layer is **unit on contracts** (log schema + failure mapper + optional extracted omit-builder; generate persist mock for compensating delete / no 200). Not “integration that SELECTs rows from local Supabase.” RPC completeness is documented in SQL (no skip-filter; generate is two-step).
2. **#2 Must-challenge:** keep “success ≠ workout as entered.” Clarify: incomplete **UI** rows are omitted; incomplete **POST elements** are 400, not a partial session.
3. **#4 Source:** add likelihood evidence `src/components/plans` / `src/components/sessions` (islands), not only interview Q2/Q4 — the silent path is generate’s success-body handling.
4. **#4 Response:** cheapest layer is **node unit on parse/outcome helpers** (especially missing `planId`), not “component/unit on the island with a failed-fetch fixture” if that implies jsdom. Failed-fetch **message extraction** can be a helper fixture without mounting React.
5. **§6.2 / §6.5:** Phase 2 still should not add Playwright. Optional mocked `supabase.rpc` is enough if a handler test is wanted; do not invent a mock framework first.
6. **Not speculative:** generate two-step persist; generate silent ok-without-id; log omit vs reject.

## Open Questions

- Should generate `ok` without `planId` be treated as a **product bug to fix in this change** (stay + error, like log missing `session.id`) or **test-only lock of current silent settle**? Planning should pick; tests must not snapshot silence as success.
- Is a mocked-Supabase `persistGeneratedPlan` test in-scope, or only exported helpers + schema, leaving live RPC to manual verification (interview Q5 infra)?
- Export `throwFromRpcMessage` vs testing only `*Failure` classes — same mapping, less coupling to private names.
