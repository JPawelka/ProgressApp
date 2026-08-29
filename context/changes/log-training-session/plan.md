# Log Training Session — Implementation Plan

## Overview

Deliver FR-004 / roadmap S-04: a logged-in user can log a training session (sets / reps / loads) against an existing plan so S-05 can read structured history. Create is one-shot (`performed_at` = now). History is a list on `/sessions`. No edit/delete of past sessions, no progression UI.

## Current State Analysis

- F-01 already created `sessions` and `session_sets` with owner RLS, lineage triggers, `UNIQUE (session_id, plan_exercise_id, set_number)`, nullable `reps` / `load_kg`, and `performed_at timestamptz NOT NULL DEFAULT now()`. No session app code inserts those rows.
- `/sessions` is a gated placeholder (`src/pages/sessions/index.astro`). Topbar has Dashboard / Plans only. Plan detail is the editor island (`EditPlanForm`); there is no log entry.
- Plan generate/edit APIs are the pattern: `prerender = false`, cookie `getUser()`, zod `.strict()`, services, `{ error }` JSON. Edit routes use `requirePlanApiAuth` in `src/lib/plans/plan-api.ts`. Middleware does **not** protect `/api/*`.
- S-03 left CASCADE: deleting a plan or exercise wipes `sessions` / `session_sets`. Confirm copy exists on plan delete; this slice does not change FKs.
- `SessionSet.load_kg` is `string | null` (`src/types.ts`). Lesson: coerce to number only at the request/display boundary; persist `numeric` via `toFixed(2)` on table writes or as `numeric` into an RPC.
- Lesson: count-then-mutate is not an invariant. Session + N sets must commit together or not at all — a client insert-session-then-sets can leave an empty session on a later failure.

## Desired End State

- From `/plans/[id]`, the owner opens a log form for that plan’s exercises (sorted by `sort_order`). Each exercise starts with **3** set rows prefilled from `default_reps` / `default_load_kg`. The user can add rows up to **8** sets per exercise.
- Save persists only **complete** sets (integer reps 1–100 **and** load 0–9999.99). Blank rows are dropped. At least one complete set is required. Skipped exercises have zero rows.
- After success the user is on `/sessions`, newest session first, with enough label to recognize the plan and when it was logged.
- Unauthenticated `/sessions` and `/plans/[id]/log` still redirect to sign-in. Stolen plan ids return 404 and do not insert. Failures do not leave an orphan `sessions` row with zero sets.
- Goal is unchanged. Progression suggestion stays S-05.

### Key Discoveries

- Schema is already the product contract — do not add tables. New SQL is an **RPC** so insert is transactional (`supabase/migrations/20260811122333_owner_scoped_persistence.sql`).
- Triggers already reject a `session_sets.plan_exercise_id` from another plan (`enforce_session_sets_integrity`).
- `/plans` list is SSR + generate island; `/plans/[id]` is SSR + edit island. Log should be a **separate page**, not a second island on the editor, so edit and log stay independently loadable.
- Incomplete-log risk (roadmap S-04 / PRD FR-004 Socrates) is managed by **not storing** blank or half-filled rows, not by changing nullability in Postgres.

## What We're NOT Doing

- Progression suggestion, accept, or override (S-05)
- Editing or deleting past sessions or individual sets after save
- Date/time picker for `performed_at`
- Rest timers, RPE, notes, bodyweight, supersets, or a social feed
- Changing CASCADE / RESTRICT on plan or exercise delete
- Service-role bypass of RLS
- A unit/e2e test runner
- shadcn Input/Dialog packages
- Rate limits (generate-only concern)
- Client-sent `user_id`, `session_id`, or `plan_id` inside set rows (plan id is the URL)

## Implementation Approach

Three phases: (1) zod + transactional RPC + `POST` so an owner can persist a session, (2) log page island + `/sessions` list + navigation, (3) manual `verification.md`. Persistence goes through a service; the route stays thin. The UI may drop empty rows; the server must drop them too and reject a body with zero complete sets.

## Critical Implementation Details

**One RPC, not session-then-sets from the Worker.** `INSERT` the `sessions` row and all `session_sets` inside `log_training_session` (lock the owner’s plan row `FOR UPDATE` like the cardinality RPCs). If validation fails, raise and insert nothing. Map persist errors to a generic 500 client message; log the real text server-side (same as plan-edit).

**Load stays a string on `SessionSet`.** Request JSON uses a number; the RPC argument is `numeric`. Do not type `load_kg` as `number` in `src/types.ts`.

**Do not import the session service into the React island.** Duplicate the 1–8 set cap as UI constants, matching plan-edit.

**`set_number` is assigned by the form (1..n after dropping blanks per exercise), not typed by the user.** Server re-checks uniqueness and 1–8.

---

## Phase 1: Log contract, RPC, and POST API

### Overview

Add an authenticated JSON endpoint that creates one session and its complete sets atomically. No UI yet.

### Changes Required:

#### 1. Log request schema

**File**: `src/lib/sessions/session-log-schema.ts` (new)

**Intent**: Single source of truth for the log payload, separate from plan-edit and generate schemas.

**Contract**:
- Body: `{ sets: array }` `.strict()`
- Each element: `plan_exercise_id` uuid string; `set_number` int 1–8; `reps` int 1–100; `load_kg` finite number 0–9999.99 (request layer only). All four required on each element (complete sets only).
- Array min 1 after client intent; server also rejects empty
- No extra keys; export a 400 `details` formatter consistent with plan-edit (`z.treeifyError`)

#### 2. Cardinality / persist RPC

**File**: `supabase/migrations/YYYYMMDDHHmmss_log_training_session_rpc.sql` (new)

**Intent**: All-or-nothing insert under the owner’s plan lock so a failed set batch cannot leave an empty session.

**Contract**:
- `log_training_session(p_plan_id uuid, p_sets jsonb) RETURNS public.sessions`
- `SECURITY INVOKER`, `search_path = public`
- `SELECT … FOR UPDATE` on `plans` where `id = p_plan_id AND user_id = auth.uid()`; not found → `RAISE EXCEPTION 'Not found'`
- Parse `p_sets` as an array of objects; empty → exception (mapped to 400 in the service)
- Each element: exercise exists on that plan and `user_id = auth.uid()`; `set_number` unique per exercise in the payload; 1–8; reps/load required
- `INSERT` into `sessions` (`user_id = auth.uid()`, `plan_id`, `performed_at = now()`)
- `INSERT` into `session_sets` for each element (`set_number`, `reps`, `load_kg`)
- `GRANT EXECUTE` to `authenticated`; `REVOKE` from `PUBLIC`; `NOTIFY pgrst, 'reload schema'`
- Apply on the database in `.dev.vars` `SUPABASE_URL` (hosted SQL Editor if that URL is `*.supabase.co`)

#### 3. Log service

**File**: `src/lib/services/session-log.ts` (new)

**Intent**: Routes only auth, parse, and map errors. RPC call uses **number | null** for load (not `toFixed` strings) so PostgREST matches `numeric`.

**Contract**:
- `logSession(supabase, userId, planId, sets): Promise<Session>` — `userId` unused if SQL uses `auth.uid()`; keep the parameter for symmetry with plan-edit
- Typed errors: not found (404), validation/empty (400), persist (500)
- Generic client 500: `"Failed to save session"`; `console.error` the RPC message
- Do not insert via table `.insert()` from the Worker for this path

#### 4. Session collection API

**File**: `src/pages/api/plans/[id]/sessions.ts` (new)

**Intent**: Authenticated POST to log against that plan.

**Contract**:
- `export const prerender = false`
- `POST` only; reuse `requirePlanApiAuth` / `parseJsonBody` / `json` from `src/lib/plans/plan-api.ts`
- No user → 401 `{ error: "Unauthorized" }`
- Invalid JSON → 400; zod fail → 400 `{ error, details }`
- Success `{ session }` **201**
- Missing/unowned plan → 404
- Empty complete-set list → 400 (do not 201)

### Success Criteria:

#### Automated Verification:

- New API module exports `prerender = false` and `POST`
- Log schema lives outside plan-edit and generate schema files
- RPC migration file exists under `supabase/migrations/`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Authenticated POST with ≥1 complete set creates one `sessions` row and matching `session_sets` (`set_number` unique per exercise)
- Body with only blank-equivalent / empty `sets` returns 400 and no new `sessions` row
- Unauthenticated POST returns 401
- POST with another user’s `plan_id` returns 404 and does not insert

**Implementation Note**: Pause for human confirmation of the API checks before Phase 2. Phase blocks use plain bullets — checkboxes live in `## Progress`.

---

## Phase 2: Log page, sessions list, and navigation

### Overview

Replace the `/sessions` placeholder with a newest-first list. Add a dedicated log page for a plan, linked from plan detail. Prefill 3 sets, cap 8, drop blanks on save, then redirect to `/sessions`.

### Changes Required:

#### 1. Log island

**File**: `src/components/sessions/LogSessionForm.tsx` (name flexible)

**Intent**: Interactive log for one plan the server already decided the user may see.

**Contract**:
- Props: `plan: Plan`, `exercises: PlanExercise[]` (serializable)
- Per exercise: 3 rows to start; each row reps + load (kg); **Add set** until 8; no per-row delete required if adding is enough (blank rows are skipped)
- Prefill from `default_reps` / `default_load_kg` (string load in the input)
- Submit `POST /api/plans/${plan.id}/sessions` with complete sets only; `set_number` 1..n per exercise after skip
- On 201: `window.location.href = "/sessions"`
- Reuse `Button`, `ServerError`, `cn`; local pending; in-island errors stay on the page
- Do not import `session-log.ts` into the island

#### 2. Log page

**File**: `src/pages/plans/[id]/log.astro` (new)

**Intent**: SSR-load the same owner plan + exercises as detail; mount the island when the plan exists.

**Contract**:
- Same not-found card as `src/pages/plans/[id].astro` for missing/foreign ids
- `client:load` island when `plan` is set
- Back link to `/plans/[id]`
- Title uses `planDisplayName`
- If exercises fail to load, do not present an empty log that can still submit (error/not-found — do not pretend the plan has zero lifts)

#### 3. Plan detail entry

**File**: `src/pages/plans/[id].astro`

**Intent**: Owner can start a log without hunting `/sessions`.

**Contract**: Visible **Log session** link (or equivalent) to `/plans/${id}/log` when the plan exists. Do not add log fields onto `EditPlanForm`.

#### 4. Sessions list

**File**: `src/pages/sessions/index.astro`

**Intent**: History the user can scan after save.

**Contract**:
- SSR: owner’s `sessions` ordered by `performed_at` DESC, with enough plan label (join/select plan `name`/`goal` or a second query)
- Empty state: prompt to open a plan and log
- No row edit/delete
- Keep Topbar + glass layout consistent with `/plans`

#### 5. Nav copy

**Files**: `src/components/Topbar.astro`; optional one-line on `src/pages/plans/index.astro`

**Intent**: Sessions are a first-class gated area.

**Contract**: Signed-in Topbar includes **Sessions** → `/sessions`. List page copy may mention logging from a plan. No list-row log button required if plan detail already has the link.

### Success Criteria:

#### Automated Verification:

- Log island is mounted from `src/pages/plans/[id]/log.astro` with `client:load`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Signed-in owner: open plan → Log session → change at least one set → save → `/sessions` shows the new row at the top
- Prefill shows plan defaults; a fourth set can be added; a 9th cannot
- Blank extra rows are not stored (Studio: no null-reps rows)
- Signed-out `/sessions` and `/plans/[id]/log` redirect to sign-in
- API error (e.g. 400) shows in the island and does not navigate away

**Implementation Note**: Pause for human confirmation of the UI checks before Phase 3.

---

## Phase 3: Manual verification

### Overview

Document repeatable FR-004 checks so the change can close without a test runner.

### Changes Required:

#### 1. Verification checklist

**File**: `context/changes/log-training-session/verification.md`

**Intent**: Human pass/fail list in the same spirit as S-03 `verification.md`.

**Contract**: Include:
1. Prerequisites: F-01 + log RPC applied on the DB in `.dev.vars`; signed-in user; at least one plan with 1–8 exercises
2. Happy path: log from plan detail; complete ≥1 set; land on `/sessions`
3. Skip empty: extra blank rows not persisted; skipped exercise has no sets
4. Bounds: 3 prefilled; add blocked at 8 per exercise
5. Auth: signed-out `/sessions` and log URL → sign-in; unauthenticated POST → 401
6. Isolation: other user cannot POST this plan (404, no rows)
7. Pass/fail table

Optional: Studio SQL that `performed_at` is close to save time.

### Success Criteria:

#### Automated Verification:

- `context/changes/log-training-session/verification.md` exists with the steps above

#### Manual Verification:

- Happy path checklist completed
- Skip-empty and 8-set cap confirmed
- Auth gate and cross-user 404 confirmed

**Implementation Note**: Do not mark the change complete until the manual checklist in `verification.md` is satisfied.

---

## Testing Strategy

### Unit Tests:

- None — do not introduce a test runner (same decision as S-02 / S-03).

### Integration Tests:

- None automated. API + RLS proven via `verification.md`.

### Manual Testing Steps:

1. `npm run dev`; sign in; open a plan; Log session
2. Save with one complete set and extra blank rows; confirm Studio row counts
3. Sign out; hit `/sessions` and the log URL
4. Second account: POST stolen `plan_id` → 404

## Performance Considerations

MVP volume is small. One RPC per save. List is a single owner query ordered by `performed_at`. Do not autosave on every keystroke.

## Migration Notes

New migration is **required** for `log_training_session`. F-01 table DDL stays unchanged. CASCADE still wipes history when a plan or exercise is deleted (S-03 confirm copy). Hosted projects must run this SQL; schema-cache misses look like `Could not find the function public.log_training_session`.

If hosted lacks F-01, apply that migration first.

## References

- PRD FR-004: `context/foundation/prd.md`
- Roadmap S-04: `context/foundation/roadmap.md`
- F-01 schema: `supabase/migrations/20260811122333_owner_scoped_persistence.sql`
- S-03 editor + CASCADE: `context/archive/2026-08-22-edit-plan-exercises/plan.md`
- F-01 CASCADE F3: `context/archive/2026-08-11-gate-product-routes/reviews/impl-review.md`
- Types: `src/types.ts`
- Lessons: `context/foundation/lessons.md`
- Auth helper: `src/lib/plans/plan-api.ts`
- Plan detail: `src/pages/plans/[id].astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Log contract, RPC, and POST API

#### Automated

- [x] 1.1 New API module exports `prerender = false` and `POST` — 97151be
- [x] 1.2 Log schema lives outside plan-edit and generate schema files — 97151be
- [x] 1.3 RPC migration file exists under `supabase/migrations/` — 97151be
- [x] 1.4 `npm run lint` passes — 97151be
- [x] 1.5 `npm run build` passes — 97151be

#### Manual

- [x] 1.6 Authenticated POST with ≥1 complete set creates one `sessions` row and matching `session_sets` (`set_number` unique per exercise) — 97151be
- [x] 1.7 Body with only blank-equivalent / empty `sets` returns 400 and no new `sessions` row — 97151be
- [x] 1.8 Unauthenticated POST returns 401 — 97151be
- [x] 1.9 POST with another user’s `plan_id` returns 404 and does not insert — 97151be

### Phase 2: Log page, sessions list, and navigation

#### Automated

- [x] 2.1 Log island is mounted from `src/pages/plans/[id]/log.astro` with `client:load`
- [x] 2.2 `npm run lint` passes
- [x] 2.3 `npm run build` passes

#### Manual

- [x] 2.4 Signed-in owner: open plan → Log session → change at least one set → save → `/sessions` shows the new row at the top
- [x] 2.5 Prefill shows plan defaults; a fourth set can be added; a 9th cannot
- [x] 2.6 Blank extra rows are not stored (Studio: no null-reps rows)
- [x] 2.7 Signed-out `/sessions` and `/plans/[id]/log` redirect to sign-in
- [x] 2.8 API error (e.g. 400) shows in the island and does not navigate away

### Phase 3: Manual verification

#### Automated

- [ ] 3.1 `context/changes/log-training-session/verification.md` exists with the steps above

#### Manual

- [ ] 3.2 Happy path checklist completed
- [ ] 3.3 Skip-empty and 8-set cap confirmed
- [ ] 3.4 Auth gate and cross-user 404 confirmed
