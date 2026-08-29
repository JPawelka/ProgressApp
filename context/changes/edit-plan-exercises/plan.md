# Edit Plan & Exercises — Implementation Plan

## Overview

Deliver FR-003 / roadmap S-03: a logged-in user can view a generated plan and edit it in place — rename the plan, change exercise names/reps/load, add or remove exercises (1–8), and delete the whole plan — so S-04 can log a session against a template that matches the workout they actually do. Goal stays a generation label. Failures do not leave the plan in an illegal count. Edit UI stays on `/plans/[id]`; session logging stays in S-04.

## Current State Analysis

- S-02 shipped generate + list + read-only detail. `/plans/[id]` SSR-loads the owner’s plan and `plan_exercises` ordered by `sort_order`, then renders a static list (`src/pages/plans/[id].astro`). “Plan not found” already covers missing/foreign ids.
- Domain API exists only for generate: `POST /api/plans/generate` (`src/pages/api/plans/generate.ts`) — cookie SSR client, `getUser()`, JSON `{ error }` / `{ planId }`, zod body, `export const prerender = false`. Auth APIs are form+redirect; do **not** copy those for edit.
- F-01 already has owner RLS for SELECT/INSERT/UPDATE/DELETE on `plans` and `plan_exercises`, plus CASCADE from plan → exercises → `session_sets`. No edit migration is required.
- `Plan.goal` is a `training_goal` enum; `Plan.name` is nullable; `PlanExercise.default_load_kg` is `string | null` (`src/types.ts`, lesson: Supabase `numeric` → string). Generate persist already uses `toLoadKg` (`Number#toFixed(2)`).
- AI generate schema requires 3–8 exercises (`src/lib/plans/plan-generation-schema.ts`). Edit must **not** reuse that array schema — per-resource PATCH/POST would fail it.
- No shadcn Input/Dialog. Forms use `FormField` + `Button` + `ServerError` (`GeneratePlanForm` is `client:load`).
- Sessions placeholder has no CRUD; CASCADE is still a real product footgun once S-04 lands (F-01 impl-review F3, deferred here).

## Desired End State

- On `/plans/[id]`, the owner edits plan name and each exercise’s name / default reps / default load, adds an exercise (appended), removes an exercise, or deletes the plan — without leaving the detail URL except after plan delete (back to `/plans`).
- Goal is visible and not editable. Regenerating via AI is still only on `/plans`.
- A plan always has 1–8 exercises after a successful mutation. The 9th add and the last-exercise delete are rejected with a clear error; the row set is unchanged.
- Delete of an exercise or plan is confirmed in the UI. Copy states the action is permanent (CASCADE will later wipe session history for that row).
- Unauthenticated `/plans/*` still redirects to sign-in. Cross-user PATCH/DELETE returns 404 (RLS: zero rows), never another user’s data.
- `npm run lint` and `npm run build` pass. Human checklist lives in `verification.md`.

### Key Discoveries

- RLS UPDATE/DELETE policies already exist — the slice is application contract + UI, not schema (`supabase/migrations/20260811122333_owner_scoped_persistence.sql`).
- `session_sets.plan_exercise_id ON DELETE CASCADE` will wipe set history when an exercise is deleted; accepted for MVP with confirm-before-delete, not RESTRICT/soft-delete (F-01 impl-review F3).
- Generate JSON helper + 401/400/4xx pattern in `src/pages/api/plans/generate.ts` is the template for all new plan APIs.
- `default_load_kg` must be written as a decimal string, never a raw JSON number sitting in `PlanExercise` (`context/foundation/lessons.md`).
- `/plans` prefix is already gated (`src/middleware.ts`); new `/api/plans/[id]` routes are not page routes — they must check `getUser()` themselves like generate.

## What We're NOT Doing

- Session logging or progression (S-04 / S-05)
- Changing `goal` or regenerating via OpenRouter
- Drag-reorder, up/down, or resequencing `sort_order` except assigning `max+1` on add
- Soft deletes, `ON DELETE RESTRICT`, archived exercises, or a global exercise catalog
- New SQL migration (unless implementer discovers a blocker — none expected)
- Introducing a unit/e2e test runner
- shadcn Input/Dialog packages — native/existing fields + in-island confirm
- Editing `user_id`, `plan_id`, or `sort_order` from the client
- Rate limits on edit (generate-only concern)

## Implementation Approach

Three phases: (1) zod + services + JSON APIs for per-resource mutations with 1–8 enforced on the server, (2) in-place React island on the existing detail page, (3) manual verification doc. Persistence goes through services so routes stay thin. UI trust is not sufficient — cardinality and ownership are server-side.

## Critical Implementation Details

**Do not reuse the AI plan schema.** `planAiSchema` requires `exercises.min(3).max(8)` on a full payload. Edit requests are per resource. New schemas in e.g. `src/lib/plans/plan-edit-schema.ts`.

**Load columns stay strings at the entity boundary.** Accept JSON numbers (or numeric strings) in the request schema, then persist with the same `toFixed(2)` mapping as `toLoadKg` in `src/lib/services/plan-generation.ts`. Do not type `default_load_kg` as `number`.

**Cardinality is a server 409, not only a hidden button.** Count the owner’s exercises for that `plan_id` before insert/delete. POST when count ≥ 8 → 409, no insert. DELETE when count ≤ 1 → 409, no delete. Plan DELETE is always allowed (CASCADE removes children).

**Concurrent cardinality:** Add and delete go through `add_plan_exercise` / `delete_plan_exercise` RPCs that `SELECT … FOR UPDATE` the parent plan row, then count and mutate, so overlapping requests cannot leave 0 or 9 exercises. Apply migration `supabase/migrations/20260829103000_plan_exercise_cardinality_rpc.sql` on the database the app uses (hosted project if `.dev.vars` points at `*.supabase.co`). Plan DELETE still uses table DELETE + CASCADE and is not blocked by the 1-exercise floor.

**Zero-row update/delete is 404.** After RLS, `.update().eq("id")` / `.delete().eq("id")` that touches no rows means missing or not owned — return `{ error }` 404, not 200.

**Confirm in the island, not `window.confirm`.** Match glass styling; require an explicit second click. Exercise copy: permanent remove from the plan. Plan copy: deletes the plan and its exercises (and later, any sessions).

---

## Phase 1: Edit contracts & APIs

### Overview

Add authenticated JSON endpoints so an owner can PATCH/DELETE a plan, POST a new exercise, and PATCH/DELETE an exercise. Enforce 1–8 and ownership in services. No UI yet.

### Changes Required:

#### 1. Edit request schemas

**File**: `src/lib/plans/plan-edit-schema.ts` (new)

**Intent**: Single source of truth for edit payloads, separate from OpenRouter generate schemas.

**Contract**:
- Plan PATCH: `name` — trimmed string max 100, empty → `null` (clears custom name; display falls back to goal label)
- Exercise POST/PATCH fields: `name` trimmed 1–80; `default_reps` nullable int 1–100; `default_load_kg` nullable finite number 0–9999.99 (request layer only)
- PATCH exercise: all three fields present (row save), not a JSON-merge bag of unknown keys
- Export a formatter for 400 `details` consistent with generate

#### 2. Edit services

**File**: `src/lib/services/plan-edit.ts` (new)

**Intent**: All mutations live in services. Routes only auth, parse, and map errors.

**Contract** (signatures approximate):
- `updatePlanName(supabase, userId, planId, name: string | null): Promise<Plan>`
- `deletePlan(supabase, userId, planId): Promise<void>`
- `addExercise(supabase, userId, planId, input): Promise<PlanExercise>` — `sort_order = max(sort_order)+1` (or 0 if none); reject if count ≥ 8
- `updateExercise(supabase, userId, planId, exerciseId, input): Promise<PlanExercise>` — also `.eq("plan_id", planId)` so ids cannot cross plans
- `deleteExercise(supabase, userId, planId, exerciseId): Promise<void>` — reject if count ≤ 1
- Map `default_load_kg` number → string via existing `toLoadKg` pattern
- Typed errors for not found vs cardinality vs persist (so routes can pick 404 / 409 / 500)
- Do not change `goal`, `user_id`, or other exercises’ `sort_order`

#### 3. Plan item API

**File**: `src/pages/api/plans/[id].ts` (new)

**Intent**: Authenticated PATCH (name) and DELETE (whole plan).

**Contract**:
- `export const prerender = false`
- Same `createClient` + `getUser()` + JSON helper pattern as `src/pages/api/plans/generate.ts`
- No user → 401 `{ error: "Unauthorized" }`
- PATCH: parse body with plan-name schema; 400 on invalid; success `{ plan }`
- DELETE: no body; success 200 `{ ok: true }` (or 204 — pick one and use it on all deletes)
- Missing/unowned plan → 404
- Invalid JSON → 400

#### 4. Exercise collection + item APIs

**Files**: `src/pages/api/plans/[id]/exercises.ts`, `src/pages/api/plans/[id]/exercises/[exerciseId].ts` (new)

**Intent**: POST add; PATCH/DELETE one exercise under that plan.

**Contract**:
- `export const prerender = false` on both
- POST `/api/plans/[id]/exercises` → `{ exercise }` 201 or 200; 409 if already 8; 404 if plan missing/unowned
- PATCH `/api/plans/[id]/exercises/[exerciseId]` → `{ exercise }`; 404 if exercise not on that plan / not owned
- DELETE same path → same success shape as plan DELETE; 409 if it is the last exercise; 404 if missing
- Unauthenticated → 401

### Success Criteria:

#### Automated Verification:

- New API modules export `prerender = false` and the HTTP methods above
- Edit schemas live outside `plan-generation-schema.ts` (generate 3–8 array rules unchanged)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Authenticated PATCH plan name persists; reload of `/plans/[id]` shows it (or display fallback when name cleared)
- Authenticated POST exercise appends with `sort_order` greater than existing max
- 9th exercise POST returns 409 and row count stays 8
- DELETE last remaining exercise returns 409 and the row remains
- Unauthenticated PATCH/DELETE/POST returns 401
- PATCH/DELETE with another user’s plan/exercise id returns 404 and does not mutate that row (second account or Studio as other user)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the API checks were successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes live in `## Progress`.

---

## Phase 2: In-place editor on plan detail

### Overview

Replace the read-only exercise list with a `client:load` island that calls Phase 1 APIs. Goal stays text. Deletes use in-island confirm. Plan delete navigates to `/plans`.

### Changes Required:

#### 1. Editor island

**File**: `src/components/plans/EditPlanForm.tsx` (name flexible)

**Intent**: Interactive editor for one plan the server already decided the user may see.

**Contract**:
- Props: `plan: Plan`, `exercises: PlanExercise[]` (serializable)
- Plan name field + save (PATCH `/api/plans/${id}`)
- Goal shown via existing `GOAL_LABELS` — not an input
- Per exercise: name, reps, load (kg), save (PATCH), delete (confirm then DELETE)
- Add exercise: shown when `exercises.length < 8`; POST then append returned row to local state
- Hide/disable add at 8; hide/disable exercise delete at 1 (still handle 409 if raced)
- Delete plan: confirm then DELETE `/api/plans/${id}`; `window.location.href = "/plans"`
- Reuse `Button`, `ServerError` (or equivalent inline error), `cn`; local pending flags (not `useFormStatus`)
- Load input: user types a number; send JSON number/null; never assume `PlanExercise.default_load_kg` is a number
- After successful row save/add/delete (except plan delete), update local state from the response — no full-page reload required
- Confirm UI is in-component (Cancel / Confirm), not `window.confirm`

#### 2. Detail page wiring

**File**: `src/pages/plans/[id].astro`

**Intent**: Keep SSR load + not-found; swap the static list for the island when a plan exists.

**Contract**:
- Unchanged data load (plan by id, exercises by `sort_order`)
- Unchanged not-found card
- When `plan` is set, render the editor island with `client:load`
- Back link to `/plans` remains
- Page title still uses `planDisplayName`

#### 3. List page (minimal)

**File**: `src/pages/plans/index.astro`

**Intent**: Copy can mention that plans are editable on the detail page. No list-row delete.

**Contract**: Optional one-line subtitle tweak only. Do not add edit/delete controls on the list.

### Success Criteria:

#### Automated Verification:

- Editor island is mounted from `src/pages/plans/[id].astro` with `client:load`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Signed-in owner: change name, change one exercise’s reps/load, save, refresh — values stick
- Add exercise at the bottom; it appears last; add is unavailable at 8
- Delete exercise shows confirm; after confirm, row gone; last exercise cannot be removed (UI + 409)
- Delete plan shows confirm; after confirm, user is on `/plans` and the plan is gone from the list
- Goal cannot be changed on the detail page
- Signed-out `/plans/[id]` still redirects to sign-in
- API error (e.g. 409) shows in the island and does not navigate away

**Implementation Note**: Pause for human confirmation of the manual UI checks before Phase 3.

---

## Phase 3: Manual verification

### Overview

Document repeatable FR-003 checks (happy path, bounds, auth, confirm) so the change can close without a test runner.

### Changes Required:

#### 1. Verification checklist

**File**: `context/changes/edit-plan-exercises/verification.md`

**Intent**: Human pass/fail list in the same spirit as S-02 `verification.md`.

**Contract**: Include:
1. Prerequisites: local Supabase, F-01 applied, signed-in user, at least one generated plan (3–8 exercises)
2. Happy path: rename plan; edit exercise name/reps/load; add one exercise (appended); delete a non-last exercise after confirm
3. Bounds: cannot add a 9th; cannot delete the last remaining exercise; messages shown
4. Delete plan: confirm → list no longer contains it; `/plans/[id]` is not-found
5. Auth: signed-out `/plans/[id]` → sign-in; unauthenticated API → 401
6. Isolation: another user cannot PATCH/DELETE this plan (404, row unchanged)
7. Goal still displayed, not editable
8. Pass/fail table for the human to tick

Optional: Studio SQL confirming `sort_order` of a newly added row is `max+1`.

### Success Criteria:

#### Automated Verification:

- `context/changes/edit-plan-exercises/verification.md` exists with the steps above

#### Manual Verification:

- Happy path checklist completed
- Bounds (1–8) confirmed
- Plan delete confirmed
- Auth gate and cross-user 404 confirmed

**Implementation Note**: Do not mark the change complete until the manual checklist in `verification.md` is satisfied.

---

## Testing Strategy

### Unit Tests:

- None — do not introduce a test runner (decision: manual verification).

### Integration Tests:

- None automated. API + RLS proven via `verification.md`.

### Manual Testing Steps:

1. `npm run dev` with local Supabase; sign in; generate a plan if none exists
2. Open detail → edit name and one lift → refresh
3. Add until 8 → add blocked; delete down to 1 → delete blocked
4. Delete plan → gone from list
5. Sign out → `/plans/[id]` redirects
6. (If two users exist) steal an id → 404, no mutation

## Performance Considerations

MVP scale is small; per-resource PATCH is cheaper than replacing the child list. No extra indexes. Do not refetch the whole plan from the client after every keystroke — save on explicit Save.

## Migration Notes

No new SQL migration expected. CASCADE behavior is unchanged: deleting a plan or exercise will delete dependent `sessions` / `session_sets` when those exist. S-04 must keep that in mind; this slice only adds confirm copy.

If hosted Supabase lacks F-01, apply the existing migration before testing.

## References

- PRD FR-003: `context/foundation/prd.md`
- Roadmap S-03: `context/foundation/roadmap.md`
- S-02 plan (read-only detail, generate API pattern): `context/changes/ai-plan-from-goal/plan.md`
- F-01 schema + CASCADE: `supabase/migrations/20260811122333_owner_scoped_persistence.sql`
- F-01 impl-review F3 (CASCADE footgun deferred to S-03): `context/archive/2026-08-11-gate-product-routes/reviews/impl-review.md`
- Types: `src/types.ts`
- Lessons (numeric): `context/foundation/lessons.md`
- Detail page: `src/pages/plans/[id].astro`
- Generate API template: `src/pages/api/plans/generate.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Edit contracts & APIs

#### Automated

- [x] 1.1 New API modules export `prerender = false` and the HTTP methods above — 028d700
- [x] 1.2 Edit schemas live outside `plan-generation-schema.ts` (generate 3–8 array rules unchanged) — 028d700
- [x] 1.3 `npm run lint` passes — 028d700
- [x] 1.4 `npm run build` passes — 028d700

#### Manual

- [x] 1.5 Authenticated PATCH plan name persists; reload of `/plans/[id]` shows it (or display fallback when name cleared) — 028d700
- [x] 1.6 Authenticated POST exercise appends with `sort_order` greater than existing max — 028d700
- [x] 1.7 9th exercise POST returns 409 and row count stays 8 — 028d700
- [x] 1.8 DELETE last remaining exercise returns 409 and the row remains — 028d700
- [x] 1.9 Unauthenticated PATCH/DELETE/POST returns 401 — 028d700
- [x] 1.10 PATCH/DELETE with another user’s plan/exercise id returns 404 and does not mutate that row (second account or Studio as other user) — 028d700

### Phase 2: In-place editor on plan detail

#### Automated

- [x] 2.1 Editor island is mounted from `src/pages/plans/[id].astro` with `client:load` — 5166ce4
- [x] 2.2 `npm run lint` passes — 5166ce4
- [x] 2.3 `npm run build` passes — 5166ce4

#### Manual

- [x] 2.4 Signed-in owner: change name, change one exercise’s reps/load, save, refresh — values stick — 5166ce4
- [x] 2.5 Add exercise at the bottom; it appears last; add is unavailable at 8 — 5166ce4
- [x] 2.6 Delete exercise shows confirm; after confirm, row gone; last exercise cannot be removed (UI + 409) — 5166ce4
- [x] 2.7 Delete plan shows confirm; after confirm, user is on `/plans` and the plan is gone from the list — 5166ce4
- [x] 2.8 Goal cannot be changed on the detail page — 5166ce4
- [x] 2.9 Signed-out `/plans/[id]` still redirects to sign-in — 5166ce4
- [x] 2.10 API error (e.g. 409) shows in the island and does not navigate away — 5166ce4

### Phase 3: Manual verification

#### Automated

- [x] 3.1 `context/changes/edit-plan-exercises/verification.md` exists with the steps above — 0a72c59

#### Manual

- [x] 3.2 Happy path checklist completed — 0a72c59
- [x] 3.3 Bounds (1–8) confirmed — 0a72c59
- [x] 3.4 Plan delete confirmed — 0a72c59
- [x] 3.5 Auth gate and cross-user 404 confirmed — 0a72c59
