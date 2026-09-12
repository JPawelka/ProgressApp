# Owner isolation and untrusted-input tests Implementation Plan

## Overview

Add Vitest coverage for test-plan Phase 3 risks #3 and #7: stolen or foreign ids fail closed as **404** with no success object (fake `eq("user_id")` on plan-edit; fake `rpc` on log/apply/add/delete-exercise), a well-formed foreign UUID still **parses** zod (lineage is not the schema), generate/edit **request** schemas reject invalid client bodies, `planEditFailure` maps 404/409/500 copy, and the cookbook names this fake-client/rpc pattern. No product behavior change. No live database, Playwright, or `APIContext` suite.

## Current State Analysis

Production already fails closed (`research.md`). Middleware is login-only for `/plans` prefixes; APIs 401 via `requirePlanApiAuth` (out of this change). Ownership is `.eq("user_id")` on `updatePlanName` / `deletePlan` / `updateExercise`, or `auth.uid()` inside RPCs for log/apply/add/delete exercise. Missing and not-owned are both **404**, never 403. Zod on log/apply accepts any UUID; RPC raises `Not found` before insert/update. Generate/edit request schemas exist but are untested. `sessionLogFailure` / `progressionApplyFailure` are class-only units; they never call `logSession` / `applyProgressionLoads`. `planEditFailure` has no tests. Count-then-mutate in `lessons.md` is out of scope (cardinality RPCs already exist).

## Desired End State

A logged-in caller with another user’s (or unmatched) plan/exercise id gets `PlanEditNotFoundError` / session-log / apply not-found mapped to **404** `"Not found"` and the fake client never yields a success row. Fake RPC `"Not found"` does not return a session or apply ok; `"Invalid sets"` / `"Invalid loads"` map to **400** `"Invalid request"`. `logSessionSchema` / `applyProgressionSchema` still succeed for a second well-formed UUID (document: shape ≠ attach). Invalid generate `goal` and invalid edit name/exercise fields fail zod. Cookbook §6.2 / §6.4 / §6.6 describe fake service clients, not two-JWT CI. `npm test` oracles are archive/product strings and 404/400 status, not `expect(fn(x)).toEqual(fn(x))`.

### Key Discoveries:

- Auth ≠ ownership (`research.md`; `src/middleware.ts:4-24` vs `plan-edit.ts:85-90`).
- Foreign UUID **passes** zod; attach fails in RPC (`session-log-schema.ts:5`; `log_training_session_rpc.sql:64-71`).
- Phase 2 cookbook already forbids live Supabase and handler mocks; “integration” here means fake `from` / `rpc` like `plan-generation.test.ts`.
- 401 on APIs is real but not the #3 oracle; skipping `requirePlanApiAuth` tests was a planning decision.

## What We're NOT Doing

- Product/UI/RPC/RLS changes
- Playwright, jsdom, island mounts, Astro page render of not-found cards
- Live Supabase, two-JWT CI, executing RPCs, `SELECT` to prove no write
- Mocking RLS / fake client to **return** User B’s row for User A
- `APIContext` handler suite; `requirePlanApiAuth` 401 units
- Re-testing log/apply empty/dup/range/strict cases (Phases 1–2)
- `not-a-uuid` extra cases; `planAiSchema` vs edit bounds
- Path-param garbage `:id` / PostgREST 500 hunts
- Plan-edit concurrency races (`lessons.md`)
- Unauthenticated **page** redirect as a substitute for ownership
- Exporting private `throwFromRpcMessage`

## Implementation Approach

Follow Phase 2: in-process fakes, no mock library. Three implement slices. Last slice fills cookbook and backports §2 cheapest-layer wording (no file:line). Manual two-user proof stays on archived verification steps.

## Critical Implementation Details

**Do not mock RLS away.** Empty `maybeSingle` / `rpc` error is the owner-isolation oracle. A stub that returns another user’s plan after the caller’s `userId` is a false green.

**Schema vs lineage.** One log test (and one apply test) must use a well-formed UUID that is *not* the “owned” fixture id and still `safeParse` success. That is not attach proof. Attach proof is fake `rpc` `{ message: "Not found" }` → not-found error class, no resolved session / no apply success.

**Failure copy.** Mapper expecteds are the **user-facing** strings already returned (`"Not found"`, `"Invalid request"`, `"Failed to save plan"` / session / progression), not raw RPC text. 409 strings: `"Plan cannot have more than 8 exercises"` / `"Plan must have at least one exercise"`.

**Fake `rpc`.** Implement `supabase.rpc(name, args)` as a thenable/plain resolve `{ data, error }` matching what `logSession` / `applyProgressionLoads` / `addExercise` / `deleteExercise` await. Record `name` + args. Do not invent a success path that bypasses the error branch.

**Fake `from` chain.** Mirror `plan-generation.test.ts`: `update`/`delete` → `eq` (capture `id`, `plan_id`, `user_id`) → `select` → `maybeSingle`. Empty data + no error → not-found. Assert captured `user_id` equals the argument passed into the service.

---

## Phase 1: Plan-edit ownership

### Overview

Prove table-write isolation for rename/delete/patch-exercise: filters include caller `user_id`; zero rows → 404 mapper; no success object. Cover `planEditFailure` 404/409/500 analogously to log/apply.

**Behavior asserted:** `updatePlanName` / `deletePlan` / `updateExercise` with empty `maybeSingle` throw `PlanEditNotFoundError`. Fake chain recorded `eq("user_id", callerId)` (and `plan_id` for exercise). `planEditFailure` → 404 `"Not found"`; cardinality classes → 409 those two strings; persist → 500 `"Failed to save plan"` without leaking the persist message; unknown → null.

**Regression caught:** Treating missing/not-owned update as 200; dropping the `user_id` filter; leaking RPC/PostgREST text on 500.

**Research source:** `research.md` Risk #3 table writes; archive S-03 zero-row 404.

**Edge:** Exercise update must `eq` `id` + `plan_id` + `user_id`. Do not add a case that returns a row for a mismatched `user_id`.

**Anti-pattern avoided:** Mocking RLS away; unauthenticated redirect; `APIContext` PATCH.

### Changes Required:

#### 1. Plan-edit mapper and fake-client tests

**File**: `src/lib/services/plan-edit.test.ts` (new)

**Intent**: Same cost × signal as generate persist: call the exported services with an in-process fake, plus class-constructed mapper cases.

**Contract**: Tests import `updatePlanName`, `deletePlan`, `updateExercise`, `planEditFailure`, and the exported error classes. No new production exports. Fake client only implements the chains those three functions use.

### Success Criteria:

#### Automated Verification:

- `plan-edit.test.ts` covers empty-row 404 paths with captured `user_id` (and `plan_id` on exercise update)
- `planEditFailure` covers 404 / 409 / 500 / null as above
- `npm test` passes
- `npm run lint` passes

#### Manual Verification:

- Skim the new tests: none of them stub a successful row for a different `user_id` than the caller

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Phase 2: Log and apply lineage

### Overview

Prove stolen plan/session/exercise ids and set-equality failures go through the **service + RPC error text**, not through zod. Document that a second well-formed UUID still parses.

**Behavior asserted:** `logSession` + fake `rpc` `"Not found"` → `SessionLogNotFoundError` (mapper 404). `"Invalid sets"` or `"Empty sets"` → `SessionLogValidationError` / 400 `"Invalid request"`. `applyProgressionLoads` + `"Not found"` → apply not-found / 404; `"Invalid loads"` → 400 `"Invalid request"`. `logSessionSchema.safeParse` with squat fixture **and** a different RFC UUID still succeeds; same idea once on `applyProgressionSchema`. Success `rpc` is not required.

**Regression caught:** Treating schema-valid UUID as attached; mapper-only tests that never call `logSession` / `applyProgressionLoads`.

**Research source:** `research.md` Risk #7 lineage table; RPC quotes in research Code References.

**Edge:** `addExercise` / `deleteExercise` fake `rpc` `"Not found"` → `PlanEditNotFoundError` (cheap; same throwFromRpc family). Skip if it bloats the fake — log + apply are the must-haves.

**Anti-pattern avoided:** Re-running Phase 1–2 shape cases; TypeScript `SessionSetWriteInput` as the oracle; live RPC.

### Changes Required:

#### 1. Fake-rpc service tests

**Files**: `src/lib/services/session-log.test.ts`, `src/lib/services/progression-apply.test.ts` (extend); optionally `plan-edit.test.ts` for add/delete rpc

**Intent**: Drive the exported persist functions so `"Not found"` / invalid-set messages are the lineage oracle.

**Contract**: Fake `rpc` records function name and payload. Assert throw class + existing `*Failure` mapping. Do not assert SQL.

#### 2. Foreign UUID still parses

**Files**: `src/lib/sessions/session-log-schema.test.ts`, `src/lib/progression/progression-apply-schema.test.ts`

**Intent**: Split shape vs attach so later readers do not treat parse-success as stored.

**Contract**: One additional test per schema: valid payload whose `plan_exercise_id` is a second well-formed UUID (already used as `benchId` in those files is enough if the comment states it is *not* a lineage check). Do not add range/empty/dup cases.

### Success Criteria:

#### Automated Verification:

- `logSession` and `applyProgressionLoads` are invoked with a fake `rpc` for not-found and invalid-message cases
- Log and apply schemas include a foreign-UUID-still-parses test
- `npm test` passes
- `npm run lint` passes

#### Manual Verification:

- Skim the new schema tests: comments or names make clear parse ≠ attach

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Phase 3: Generate/edit schemas and cookbook

### Overview

Close untrusted-body gaps that are **not** log/apply shape (already shipped). Point the cookbook at fake ownership/rpc tests. Backport §2 cheapest-layer cells. Manual two-user remains archive isolation, not CI.

**Behavior asserted:** `generatePlanRequestSchema` rejects missing/invalid `goal`; accepts `mass` | `strength` | `endurance`. `patchPlanSchema` / `exerciseWriteSchema` reject extra keys (`.strict()`), empty/overlong names, reps/load outside edit bounds (reps 1–100, load 0–9999.99, nullable where the schema allows). Cookbook tells the next author to extend `plan-edit.test.ts` / fake `rpc`, not Playwright.

**Regression caught:** “Client validation is enough”; TS-only coverage for generate/edit bodies.

**Research source:** `research.md` Open Questions 1–2; planning decisions (skip 401, skip planAi, skip live Supabase).

**Edge:** Extra keys on generate are stripped (not `.strict()`); do not assert 400 for unknown keys on generate.

**Anti-pattern avoided:** Handler mocks; rewriting §1/§2 with file anchors.

### Changes Required:

#### 1. Generate request schema tests

**File**: `src/lib/plans/plan-generation-schema.test.ts` (new)

**Intent**: Untrusted generate body is the enum, not island `as TrainingGoal`.

**Contract**: `safeParse` missing goal, invalid string, and one valid enum. Oracle = `trainingGoalSchema` values in the schema file / product goal union — not OpenRouter.

#### 2. Plan-edit schema tests

**File**: `src/lib/plans/plan-edit-schema.test.ts` (new)

**Intent**: Server zod is the edit write contract.

**Contract**: Cover `.strict()` extras, name empty→null transform / max 100, exercise name/reps/load bounds matching `exerciseWriteSchema` (same numbers as log/apply archives: reps 1–100, load 0–9999.99).

#### 3. Test-plan cookbook and backports

**File**: `context/foundation/test-plan.md`

**Intent**: Phase 3 patterns are the default for ownership and untrusted POST; §2 cheapest layers match research.

**Contract**: Update §6.2: ownership = fake `eq("user_id")` / fake `rpc` `"Not found"`; do not mock RLS to return a row; still no live Supabase / `APIContext` suite. Update §6.4: new write APIs still prefer schema + `*Failure` + service fake; ownership 404 is that fake, not a handler. §6.6 note for this change-id. §4 test-base: IDOR/lineage now covered at service fake layer. §2 Risk Response cheapest-layer cells for **#3** and **#7** per `research.md` Open Question 1 (no file:line). Bump Last updated. Do not change §3 Status here unless already `implementing` from the orchestrator.

### Success Criteria:

#### Automated Verification:

- New generate and edit schema test files exist and cover the cases above
- `npm test` passes
- `npm run lint` passes
- `context/foundation/test-plan.md` §6.2 / §6.4 / §6.6 describe Phase 3 fakes; §2 #3/#7 cheapest-layer cells are backported

#### Manual Verification:

- Skim cookbook: a new IDOR test would not open Playwright or local Supabase
- If two accounts are available, follow archive isolation (S-03 PATCH/DELETE 404; S-04 stolen `plan_id` 404) from `context/archive/2026-08-22-edit-plan-exercises/verification.md` and `context/archive/2026-08-29-log-training-session/plan.md` — optional; not a CI gate

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- `planEditFailure` status + copy
- `generatePlanRequestSchema` / `patchPlanSchema` / `exerciseWriteSchema`
- Foreign UUID still parses on log/apply schemas

### Integration Tests:

- In-process fake `from` / `rpc` at the service (not a database)

### Manual Testing Steps:

1. Phase 1: confirm no “return B’s row for A” stubs
2. Phase 2: confirm parse≠attach naming
3. Phase 3: cookbook skim; optional two-account archive steps

## Performance Considerations

None. In-process Vitest.

## Migration Notes

None.

## References

- Related research: `context/changes/testing-owner-isolation-and-untrusted-input/research.md`
- Test plan: `context/foundation/test-plan.md` §3 Phase 3
- Fake-client pattern: `src/lib/services/plan-generation.test.ts`
- Archive isolation: `context/archive/2026-08-22-edit-plan-exercises/verification.md`, `context/archive/2026-08-29-log-training-session/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Plan-edit ownership

#### Automated

- [x] 1.1 `plan-edit.test.ts` covers empty-row 404 paths with captured `user_id` (and `plan_id` on exercise update) — 329975e
- [x] 1.2 `planEditFailure` covers 404 / 409 / 500 / null as above — 329975e
- [x] 1.3 `npm test` passes — 329975e
- [x] 1.4 `npm run lint` passes — 329975e

#### Manual

- [x] 1.5 Skim the new tests: none of them stub a successful row for a different `user_id` than the caller — 329975e

### Phase 2: Log and apply lineage

#### Automated

- [x] 2.1 `logSession` and `applyProgressionLoads` are invoked with a fake `rpc` for not-found and invalid-message cases — 776b758
- [x] 2.2 Log and apply schemas include a foreign-UUID-still-parses test — 776b758
- [x] 2.3 `npm test` passes — 776b758
- [x] 2.4 `npm run lint` passes — 776b758

#### Manual

- [x] 2.5 Skim the new schema tests: comments or names make clear parse ≠ attach — 776b758

### Phase 3: Generate/edit schemas and cookbook

#### Automated

- [x] 3.1 New generate and edit schema test files exist and cover the cases above — 32e555d
- [x] 3.2 `npm test` passes — 32e555d
- [x] 3.3 `npm run lint` passes — 32e555d
- [x] 3.4 `context/foundation/test-plan.md` §6.2 / §6.4 / §6.6 describe Phase 3 fakes; §2 #3/#7 cheapest-layer cells are backported — 32e555d

#### Manual

- [x] 3.5 Skim cookbook: a new IDOR test would not open Playwright or local Supabase — 32e555d
- [x] 3.6 If two accounts are available, follow archive isolation (S-03 PATCH/DELETE 404; S-04 stolen `plan_id` 404) from `context/archive/2026-08-22-edit-plan-exercises/verification.md` and `context/archive/2026-08-29-log-training-session/plan.md` — optional; not a CI gate — 32e555d (skipped: no two accounts)
