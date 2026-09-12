# Persist completeness and error visibility Implementation Plan

## Overview

Add Vitest coverage for test-plan Phase 2 risks #2 and #4 by locking session log contracts (schema, RPC error mapping, client omit/renumber), extracting shared error/success-body parsers so generate/log/apply failures stay with a message, fixing generate’s silent `ok` without `planId`, proving generate persist throws (and attempts compensating delete) with an in-process fake Supabase client, and filling `context/foundation/test-plan.md` §6.2 / §6.5.

## Current State Analysis

Session log, plan generate, and apply are different persist seams (`research.md`). Log: island omits incomplete drafts (`LogSessionForm.tsx:70-83,129-154`); zod + RPC **reject** incomplete POST elements; RPC inserts all requested `p_sets` atomically and returns the `sessions` row only. 201 `{ session }` cannot prove set rows. Generate: two table inserts + compensating delete (`plan-generation.ts:61-112`); `200 { planId }` only after both succeed; orphan possible **with 500**. Apply: all-or-nothing RPC; schema already unit-tested.

Error visibility: log/apply `!ok` → duplicated `readError` → `ServerError`. Generate `!ok` sets error, but `ok` without `planId` neither errors nor navigates (`GeneratePlanForm.tsx:28-36`). Vitest remains `environment: "node"`; no jsdom. Phase 1 pattern: extract helpers next to `src/lib/sessions/` and `src/lib/progression/`. `persistGeneratedPlan` is not exported. `lessons.md` count-then-mutate is out of scope (stale vs cardinality RPCs).

## Desired End State

Incomplete log drafts never appear in the POST `sets` array; empty complete-set list is a client error, not a 201. Zod rejects empty/incomplete/duplicate log bodies. RPC persist/validation/not-found map to 400/404/500 JSON `{ error }` strings the islands already display. Generate missing `planId` is stay-with-error (same idea as missing `session.id`). Exercise-insert failure on generate throws `PlanPersistError` and invokes `plans.delete`. Apply failure mapper covers 400/404/503/500. Cookbook §6.2 / §6.5 name these patterns. `npm test` uses product/archive oracles (complete-set ranges, generic 500 copy), not `expect(fn(x)).toEqual(fn(x))`.

### Key Discoveries:

- “Success = workout as entered” is false for the form; true only for posted complete `sets` (`research.md` Risk #2).
- Server does not drop incomplete sets and 201 — it 400s (`session-log-schema.ts`, RPC `Invalid sets`).
- Generate silent `ok` without `planId` is the #4 hole (`GeneratePlanForm.tsx:34-36`).
- Cheapest layer: helpers + schema + `*Failure` + one fake client. No Playwright, no live `SELECT` (planning decisions).

## What We're NOT Doing

- Playwright, jsdom, Testing Library, island mount, pixel snapshots
- Live Supabase / `SELECT session_sets` / executing RPC in CI
- Mocked `APIContext` POST handlers for all three routes (except the in-process fake **client** for `persistGeneratedPlan`)
- Risks #1, #3, #5, #6, #7; IDOR; untrusted-input beyond log zod already in this slice
- Plan-edit cardinality / count-then-mutate races
- Re-testing `applyProgressionSchema` (already covered)
- OpenRouter / mock-plan payload tours
- Making apply SQL re-run the progression rule
- Snapshotting generate’s current silent settle as success
- Exporting private `throwFromRpcMessage` names — test exported `*Failure` + error classes

## Implementation Approach

Follow Phase 1: extract pure modules under `src/lib/`, wire islands, keep Vitest `node`. Product change only where locked: generate missing `planId` stays with an error string. Last phase updates the test-plan cookbook and §2 response/source cells (no file:line anchors).

## Critical Implementation Details

**Oracle independence.** Log schema expecteds come from archive complete-set ranges (reps 1–100, load 0–9999.99, set_number 1–8, ≥1 set) — `context/archive/2026-08-29-log-training-session/plan.md`. Failure-mapper expecteds are the **user-facing** strings already returned (`"Invalid request"`, `"Failed to save session"`, `"Failed to save progression"`), not RPC exception text. Do not `expect(sessionLogFailure(e)).toEqual(sessionLogFailure(e))`.

**Generate missing `planId` copy.** Use a stay-with-error message parallel to log: the owner is told the plan page could not be opened. Do not navigate. Do not leave `error` null.

**Fake Supabase client.** In-process object that implements the `from().insert().select().single()` / `from().insert()` / `from().delete().eq().eq()` chain `persistGeneratedPlan` actually calls. No extra mock library. Assert delete is invoked on exercise-insert error; still throw `PlanPersistError` if delete itself fails (orphan is failure-visible, not 200).

**Export for test.** Export `persistGeneratedPlan` from `plan-generation.ts` so the fake client does not go through OpenRouter.

---

## Phase 1: Session completeness

### Overview

Lock the log persist contract: incomplete POST elements are not a session; client omit/renumber matches the completeness rule; RPC-shaped errors map to HTTP `{ error }` the island can show.

**Behavior asserted:** Empty `sets` / missing-or-out-of-range reps or load / duplicate `(plan_exercise_id, set_number)` fail zod. Client builder omits incomplete drafts and renumbers complete ones; all-blank → no sets (caller shows the existing “at least one complete set” copy). `SessionLogValidationError` → 400 `"Invalid request"`; not-found → 404; persist → 500 `"Failed to save session"`.

**Regression caught:** Treating incomplete UI rows as persisted; treating incomplete POST as 201; leaking RPC text on 500.

**Research source:** `research.md` Risk #2 session; archive log-training-session completeness.

**Edge:** Invalid filled row omitted (same as blank); skipped exercise → no rows for that id; unique-key refine.

**Anti-pattern avoided:** Live `SELECT`; “all plan exercises must be logged”; mirroring handler `try/catch` structure.

### Changes Required:

#### 1. Log payload builder

**File**: `src/lib/sessions/log-session-sets.ts` (new)

**Intent**: Move omit + renumber + max-8-per-exercise + empty check out of `LogSessionForm.save` so completeness is testable without jsdom.

**Contract**: Export a function that takes exercises + per-exercise draft rows (`reps`/`load` strings) and returns either `{ ok: true, sets: SessionSetWriteInput[] }` or `{ ok: false, error: string }` using the existing client copies (“Log at least one complete set…” / “Each exercise can have at most 8 sets”). Complete = same rules as today’s `isCompleteSet`. `set_number` is 1..n over complete rows only.

#### 2. Wire log island

**File**: `src/components/sessions/LogSessionForm.tsx`

**Intent**: `save()` builds the payload via the helper; no duplicate completeness logic.

**Contract**: On `{ ok: false }`, `setError` and return (no fetch). On `{ ok: true }`, POST `{ sets }` as today.

#### 3. Schema + failure-mapper tests

**Files**: `src/lib/sessions/session-log-schema.test.ts` (new), `src/lib/services/session-log.test.ts` (new), `src/lib/sessions/log-session-sets.test.ts` (new)

**Intent**: Automated oracles for completeness and visible persist failure.

**Contract**: Schema cases: happy unique in-range list; empty `sets`; missing/null reps or load; reps/load/set_number out of archive ranges; duplicate keys; `.strict()` extras. `sessionLogFailure` cases: `SessionLogNotFoundError` → 404 `"Not found"`; `SessionLogValidationError` → 400 `"Invalid request"`; `SessionLogPersistError` → 500 `"Failed to save session"`; unknown → `null`. Builder cases: mixed complete+blank → only complete, renumbered; invalid filled omitted; all blank → `ok: false`.

### Success Criteria:

#### Automated Verification:

- `src/lib/sessions/log-session-sets.ts` is used by `LogSessionForm` (no leftover private `isCompleteSet` that diverges from the helper)
- `npm test` covers the schema, mapper, and omit/renumber cases above
- `npm run lint` passes

#### Manual Verification:

- Log a session with one complete lift and one left blank: save succeeds and only the complete lift appears on the suggestion screen (existing north-star UI)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Error visibility

### Overview

Prove generate/log/apply error **bodies** become a stay-with-message. Fix generate `ok` without `planId` so silence is not the product.

**Behavior asserted:** `errorMessageFromBody` returns `error` string or the fallback. `planIdFromGenerateResponse` returns a non-empty string or `null`. Generate: `!ok` or missing `planId` or thrown fetch → `setError`, no `window.location` to `/plans/...`. Log/suggestion keep using the shared body reader for `!ok`.

**Regression caught:** Generate 200 without `planId` looking like a quiet success; `readError` drift across islands.

**Research source:** `research.md` Risk #4; Phase 1 `sessionIdFromLogResponse` pattern.

**Edge:** Non-JSON `!ok` body → fallback; `error` non-string → fallback; empty `planId` `""`.

**Anti-pattern avoided:** jsdom mount; Playwright; asserting `ServerError` class names.

### Changes Required:

#### 1. Shared error body helper

**File**: `src/lib/http/error-message-from-body.ts` (new)

**Intent**: One parse of `{ error?: unknown }` so islands do not each invent silent fallbacks.

**Contract**: `errorMessageFromBody(data: unknown, fallback: string): string` — if `data` is an object with string `error` of length > 0, return it; otherwise `fallback`.

#### 2. Generate success-id helper

**File**: `src/lib/plans/plan-id-from-generate-response.ts` (new)

**Intent**: Same contract as `sessionIdFromLogResponse` for `{ planId }`.

**Contract**: `planIdFromGenerateResponse(data: unknown): string | null` — non-empty string `planId` or `null`.

#### 3. Wire islands + generate fix

**Files**: `src/components/plans/GeneratePlanForm.tsx`, `src/components/sessions/LogSessionForm.tsx`, `src/components/sessions/SuggestionForm.tsx`

**Intent**: Shared reader for `!ok`. Generate missing id stays with error (product fix). Suggestion still navigates on HTTP `ok` without requiring `{ ok: true }` in the body (current apply contract).

**Contract**: Generate: after `ok`, if `planIdFromGenerateResponse(data)` is null, `setError` with a message that the plan page could not be opened; do not redirect. Log/Suggestion: `readError` uses `errorMessageFromBody` (may still `response.json()` then pass data). Optional: `EditPlanForm` may use the same helper if it is a one-line swap; not required for risk #4.

#### 4. Helper tests

**Files**: `src/lib/http/error-message-from-body.test.ts` (new), `src/lib/plans/plan-id-from-generate-response.test.ts` (new)

**Intent**: Node units for stay-vs-navigate inputs.

**Contract**: Mirror `session-id-from-log-response.test.ts` shape: happy string; missing/empty/non-string → null / fallback.

### Success Criteria:

#### Automated Verification:

- `GeneratePlanForm` does not navigate when `planId` is missing; it sets an error string
- `npm test` includes error-body and `planId` parse cases
- `npm run lint` passes

#### Manual Verification:

- Trigger a failed generate or log (e.g. invalid/offline): the form stays on the page and shows a red `ServerError` message, not a blank form that looks saved

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Generate persist, apply mapping, cookbook

### Overview

Prove generate persist failure is not a 200, and that compensating delete is attempted. Lock apply `*Failure` mapping. Document cookbook + test-plan backports.

**Behavior asserted:** `persistGeneratedPlan` on exercise-insert error throws `PlanPersistError`, calls delete on the created plan id, does not return an id. Plan-insert error throws without delete. Happy path returns the inserted id. `progressionApplyFailure`: not-found 404; validation 400 `"Invalid request"`; “not set up” 503 with that message; other persist 500 `"Failed to save progression"`.

**Regression caught:** Returning `planId` after a failed child insert; treating apply RPC miss as 200.

**Research source:** `research.md` generate two-step; apply mapper table.

**Edge:** Delete also fails → still throw `PlanPersistError` (not success).

**Anti-pattern avoided:** OpenRouter; Postgres engine; re-testing apply zod; file:line in §2.

### Changes Required:

#### 1. Export persist + fake-client tests

**Files**: `src/lib/services/plan-generation.ts`, `src/lib/services/plan-generation.test.ts` (new)

**Intent**: Test the persist seam without AI.

**Contract**: Export `persistGeneratedPlan`. Tests pass a fake client: (a) plan insert ok, exercise insert error → delete chain used with that `planId` + `userId`, throw `PlanPersistError`; (b) plan insert error → throw, delete not used; (c) both inserts ok → returned id, delete not used.

#### 2. Apply failure mapper tests

**File**: `src/lib/services/progression-apply.test.ts` (new)

**Intent**: Visible apply failure contract without RPC.

**Contract**: Construct the exported error classes and assert `progressionApplyFailure` status + `error` strings listed in Overview.

#### 3. Test-plan cookbook and backports

**File**: `context/foundation/test-plan.md`

**Intent**: Future tests follow Phase 2 patterns; §2 stays evidence-only.

**Contract**: Fill §6.2 (persist: schema + `*Failure` + optional in-process fake client; no live SELECT; no Playwright). Fill §6.5 (extract parse helpers under `src/lib/`; node units; do not mount islands). Update §4 test-base note. Backport §2 Risk Response cheapest-layer wording for #2/#4 per `research.md` Test-plan corrections (no file:line). Add #4 Source likelihood dirs `src/components/plans` / `src/components/sessions`. Bump Last updated.

### Success Criteria:

#### Automated Verification:

- `persistGeneratedPlan` is exported and covered by the fake-client cases
- `npm test` still passes
- `npm run lint` passes
- `context/foundation/test-plan.md` §6.2 and §6.5 are no longer TBD

#### Manual Verification:

- Skim §6.2 / §6.5: a new persist or error-visibility test would not open Playwright or jsdom

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- `logSessionSchema` completeness and uniqueness (archive ranges)
- `buildLogSessionSets` omit / renumber / empty
- `sessionLogFailure` / `progressionApplyFailure` user-facing status+body
- `errorMessageFromBody` / `planIdFromGenerateResponse`
- `persistGeneratedPlan` with fake client

### Integration Tests:

- None against a database. The fake persist client is the persist-edge stand-in (cost × signal; interview Q5).

### Manual Testing Steps:

1. Phase 1: log mixed complete + blank → suggestion lists only the logged lift
2. Phase 2: failed generate/log shows `ServerError` and stays
3. Phase 3: cookbook skim

## Performance Considerations

None. Tests are in-process Vitest.

## Migration Notes

None.

## References

- Related research: `context/changes/testing-persist-and-error-visibility/research.md`
- Test plan: `context/foundation/test-plan.md` §3 Phase 2
- Similar implementation: `src/lib/sessions/session-id-from-log-response.ts` and Phase 1 `context/archive/2026-08-31-testing-critical-path-coverage/plan.md`
- Completeness oracle: `context/archive/2026-08-29-log-training-session/plan.md`
- Generate persist history: `context/archive/2026-08-16-ai-plan-from-goal/reviews/impl-review.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Session completeness

#### Automated

- [x] 1.1 `src/lib/sessions/log-session-sets.ts` is used by `LogSessionForm` (no leftover private `isCompleteSet` that diverges from the helper) — 2462d90
- [x] 1.2 `npm test` covers the schema, mapper, and omit/renumber cases above — 2462d90
- [x] 1.3 `npm run lint` passes — 2462d90

#### Manual

- [x] 1.4 Log a session with one complete lift and one left blank: save succeeds and only the complete lift appears on the suggestion screen (existing north-star UI) — 2462d90

### Phase 2: Error visibility

#### Automated

- [x] 2.1 `GeneratePlanForm` does not navigate when `planId` is missing; it sets an error string — 149139f
- [x] 2.2 `npm test` includes error-body and `planId` parse cases — 149139f
- [x] 2.3 `npm run lint` passes — 149139f

#### Manual

- [x] 2.4 Trigger a failed generate or log (e.g. invalid/offline): the form stays on the page and shows a red `ServerError` message, not a blank form that looks saved — 149139f

### Phase 3: Generate persist, apply mapping, cookbook

#### Automated

- [x] 3.1 `persistGeneratedPlan` is exported and covered by the fake-client cases
- [x] 3.2 `npm test` still passes
- [x] 3.3 `npm run lint` passes
- [x] 3.4 `context/foundation/test-plan.md` §6.2 and §6.5 are no longer TBD

#### Manual

- [x] 3.5 Skim §6.2 / §6.5: a new persist or error-visibility test would not open Playwright or jsdom
