# Owner-scoped persistence & gated product routes — Implementation Plan

## Overview

Land F-01’s owner-scoped persistence contract for plans and session history: a lean Supabase schema with per-owner RLS, shared TypeScript entity types, and middleware-gated `/plans` and `/sessions` placeholders. This unlocks S-02–S-05 without inventing domain CRUD yet, and makes the PRD privacy / Access Control guardrails verifiable.

## Current State Analysis

- Auth cookie SSR and route gating exist (`src/lib/supabase.ts`, `src/middleware.ts`); only `/dashboard` is protected.
- Supabase is wired for `auth.users` only — `supabase/migrations/` is absent; no `.sql` files in the repo; `config.toml` points at a missing `./seed.sql`.
- No `src/types.ts`, no `src/lib/services/`, no plan/session pages or domain APIs.
- Repo conventions already require RLS with granular per-operation policies and `YYYYMMDDHHmmss_short_description.sql` migrations (`AGENTS.md`, `CLAUDE.md`).
- Roadmap F-01 Change ID is `owner-scoped-persistence`; this folder is `gate-product-routes` (same F-01 intent).

## Desired End State

- Four owner-scoped tables (`plans`, `plan_exercises`, `sessions`, `session_sets`) exist with `user_id` + `auth.uid()` RLS (SELECT/INSERT/UPDATE/DELETE each), CASCADE ownership, and lean columns enough for later slices to insert without redesign.
- `src/types.ts` exposes matching entity types (`TrainingGoal`, `Plan`, `PlanExercise`, `Session`, `SessionSet`).
- Unauthenticated requests to `/plans` and `/sessions` redirect to `/auth/signin`; signed-in users see thin placeholders.
- Local `supabase db reset` (or migrate) applies cleanly; documented two-user checks prove cross-user denial.
- README no longer claims “no migrations / auth.users only.”

### Key Discoveries:

- Middleware gate is prefix-based `PROTECTED_ROUTES` in `src/middleware.ts` — extend the array; mirror `dashboard.astro` for placeholders.
- Anon-key SSR client only — RLS must enforce ownership; no service-role key in env today.
- Child tables need denormalized `user_id` so policies stay single-predicate (no parent joins on every `session_sets` row).
- `sessions.plan_id` is NOT NULL — PRD flow assumes a plan before logging; CASCADE on plan delete is acceptable for MVP single-owner data.

## What We're NOT Doing

- Domain CRUD APIs, services/repositories, or AI plan generation (S-02+)
- Progression suggestion / accept-override storage (S-05)
- Soft deletes, roles beyond flat owner, sharing, or catalog of global exercises
- Generated Supabase `Database` types / `supabase gen types` workflow
- Automated pgTAP/CI policy tests (manual Studio/SQL verification only)
- Renaming this change folder to match roadmap Change ID `owner-scoped-persistence`

## Implementation Approach

Ship foundation in three phases: (1) SQL contract + RLS, (2) typed app surface + gated stubs, (3) human ownership verification. Schema stays lean; later slices own behavior columns and insert paths.

## Critical Implementation Details

**Child `user_id` integrity:** RLS alone does not stop an authenticated user from inserting a child row with their own `user_id` but another user’s parent FK (`plan_id` / `session_id`). Add `BEFORE INSERT OR UPDATE` triggers so: `plan_exercises.user_id` equals the parent plan’s `user_id`; `sessions.user_id` equals the parent plan’s `user_id`; `session_sets.user_id` equals the parent session’s `user_id`. Also enforce that `session_sets.plan_exercise_id` belongs to the same plan as `sessions.plan_id` (prevents same-owner cross-plan set/exercise pairing). Without this, ownership isolation is incomplete.

**Migration apply target:** Prefer local Supabase (`npx supabase start` + `db reset` / migrate) for automated verification. Hosted push is optional ops follow-up once `supabase link` is ready — not required to close this change if local RLS checks pass.

---

## Phase 1: Owner-scoped schema & RLS

### Overview

Create the first app migration: enum, four tables, indexes, CASCADE FKs, per-operation RLS policies, `updated_at` triggers, child-owner consistency triggers, and a minimal `seed.sql` so reset does not fail.

### Changes Required:

#### 1. Migration SQL

**File**: `supabase/migrations/YYYYMMDDHHmmss_owner_scoped_persistence.sql` (timestamp at implement time)

**Intent**: Introduce the owner-scoped persistence contract so plans and session history can be stored with enforceable per-owner access.

**Contract**:
- Enum `training_goal`: `'mass' | 'strength' | 'endurance'`
- Tables (dependency order): `plans` → `plan_exercises`; `sessions` (FK → `plans`); `session_sets` (FK → `sessions`, `plan_exercises`)
- Every table: `id uuid PK DEFAULT gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `created_at` / `updated_at timestamptz NOT NULL DEFAULT now()`
- `plans`: `goal training_goal NOT NULL`, `name text NULL`
- `plan_exercises`: `plan_id` CASCADE, `name text NOT NULL`, `sort_order int NOT NULL DEFAULT 0`, `default_reps int NULL`, `default_load_kg numeric(6,2) NULL`
- `sessions`: `plan_id uuid NOT NULL` CASCADE, `performed_at timestamptz NOT NULL DEFAULT now()`
- `session_sets`: `session_id` CASCADE, `plan_exercise_id` CASCADE, `set_number int NOT NULL`, `reps int NULL`, `load_kg numeric(6,2) NULL`; `UNIQUE (session_id, plan_exercise_id, set_number)`
- Indexes: `(user_id, created_at DESC)` on plans; `(plan_id, sort_order)` + `(user_id)` on plan_exercises; `(user_id, performed_at DESC)` + `(plan_id, performed_at DESC)` on sessions; `(session_id, plan_exercise_id, set_number)`, `(plan_exercise_id, session_id)`, `(user_id)` on session_sets
- RLS enabled on all four; **16 policies** (4 ops × 4 tables): `USING` / `WITH CHECK` `auth.uid() = user_id` — granular policies, not `FOR ALL`
- Triggers: `updated_at` on all tables; child `user_id` must match parent owner on `plan_exercises` (`plans.user_id`), `sessions` (`plans.user_id` for `plan_id`), and `session_sets` (`sessions.user_id`); `session_sets` must also require `plan_exercises.plan_id = sessions.plan_id` for the chosen FKs

#### 2. Seed file for local reset

**File**: `supabase/seed.sql`

**Intent**: Satisfy `config.toml` `[db.seed] sql_paths = ["./seed.sql"]` so `supabase db reset` does not fail on a missing file.

**Contract**: Empty or comment-only seed; no domain seed data in F-01.

### Success Criteria:

#### Automated Verification:

- `supabase/migrations/*_owner_scoped_persistence.sql` exists with the four tables and RLS enabled
- `supabase/seed.sql` exists
- Migration applies cleanly locally: `npx supabase db reset` (or equivalent migrate) with exit 0
- `npm run lint` passes (no app TS changes required in this phase if deferred to Phase 2)

#### Manual Verification:

- In local Studio, each of the four tables shows RLS enabled and four policies (select/insert/update/delete)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Types & gated product stubs

### Overview

Expose shared entity types, extend middleware protection to planned product prefixes, add thin signed-in placeholders, and correct README persistence claims.

### Changes Required:

#### 1. Shared entity types

**File**: `src/types.ts` (create)

**Intent**: Give later slices a typed contract matching the migration without introducing a service layer.

**Contract**: Export `TrainingGoal`, `Plan`, `PlanExercise`, `Session`, `SessionSet` with fields mirroring the SQL columns (ISO string timestamps; `number | null` for nullable numerics). No insert/update DTO helpers required in F-01.

#### 2. Protect product route prefixes

**File**: `src/middleware.ts`

**Intent**: Unauthenticated users cannot reach gated plan/session routes (PRD Access Control).

**Contract**: Extend `PROTECTED_ROUTES` to include `/plans` and `/sessions` alongside `/dashboard` (prefix `startsWith` behavior unchanged).

#### 3. Placeholder pages

**Files**: `src/pages/plans/index.astro`, `src/pages/sessions/index.astro`

**Intent**: Make the new gates manually testable with a signed-in shell; no product CRUD.

**Contract**: Mirror `dashboard.astro` patterns (`Layout`, `Astro.locals.user`, sign-out form). Copy states these are placeholders for upcoming plan/session work. Titles: Plans / Sessions.

#### 4. README persistence note

**File**: `README.md`

**Intent**: Stop documenting an outdated “auth.users only / no migrations” baseline.

**Contract**: Replace the “No database tables or migrations are required…” sentence with a short note that app migrations under `supabase/migrations/` define owner-scoped plans/sessions schema; local reset applies them. Also add `/plans` and `/sessions` to the Auth routes table alongside `/dashboard`.

### Success Criteria:

#### Automated Verification:

- `src/types.ts` exports the five symbols above
- `PROTECTED_ROUTES` includes `/dashboard`, `/plans`, `/sessions`
- Placeholder pages exist at `src/pages/plans/index.astro` and `src/pages/sessions/index.astro`
- `npm run lint` passes
- `npm run build` passes (with Supabase env available as in CI)

#### Manual Verification:

- Signed-out visit to `/plans` and `/sessions` redirects to `/auth/signin`
- Signed-in visit shows the placeholder shell (email visible, no domain CRUD)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Ownership verification

### Overview

Prove the privacy guardrail with two-user checks and capture the steps so later slices can re-run them after schema changes.

### Changes Required:

#### 1. Verification notes in the change folder

**File**: `context/changes/gate-product-routes/verification.md` (create)

**Intent**: Document repeatable manual RLS + route-gate checks without adding a test runner.

**Contract**: Include:
1. Prerequisites (`npx supabase start`, two confirmed users or SQL inserts as JWT-authenticated clients)
2. Steps: as User A insert a plan (+ child rows); as User B attempt SELECT/INSERT against User A’s ids — expect empty/denied
3. Route checks: anonymous `/plans` and `/sessions` → sign-in redirect
4. Pass/fail checklist the human fills when running Phase 3

No app code changes required in this phase unless verification discovers a policy/trigger gap (fix in Phase 1 migration and re-verify).

### Success Criteria:

#### Automated Verification:

- `context/changes/gate-product-routes/verification.md` exists with the two-user RLS and route-gate steps

#### Manual Verification:

- Cross-user SELECT of another user’s plan returns no rows (or policy error)
- Cross-user INSERT into another user’s plan lineage fails (policy and/or trigger)
- Anonymous `/plans` and `/sessions` redirect to `/auth/signin`
- Signed-in access to both placeholders succeeds

**Implementation Note**: This phase is primarily human verification. Do not mark the change complete until the manual checklist in `verification.md` is satisfied.

---

## Testing Strategy

### Unit Tests:

- None — repo has no unit test runner yet; do not introduce one in F-01.

### Integration Tests:

- None automated. RLS proven via Studio/SQL steps in `verification.md`.

### Manual Testing Steps:

1. `npx supabase start` && apply migrations (`db reset`)
2. Confirm policies in Studio for all four tables
3. Run two-user denial checks from `verification.md`
4. Sign out → open `/plans` and `/sessions` → land on sign-in
5. Sign in → open `/plans` and `/sessions` → see placeholders

## Performance Considerations

MVP scale is small; owner-scoped indexes on `(user_id, …)` and exercise-history `(plan_exercise_id, session_id)` are enough for S-04/S-05 list patterns. No caching layer.

## Migration Notes

- First app migration — safe on empty public schema; hosted projects still `auth.users` only until this SQL is pushed.
- Migrations do not roll back with Worker deploy (`infrastructure.md` / deployment plan) — apply forward or restore DB separately.
- Fixing missing `seed.sql` unblocks `db reset`; keep seed empty until a later slice needs fixtures.

## References

- Roadmap F-01: `context/foundation/roadmap.md`
- PRD Access Control + privacy guardrails: `context/foundation/prd.md`
- Auth / gate pattern: `src/middleware.ts`, `src/pages/dashboard.astro`
- Conventions: `AGENTS.md`, `CLAUDE.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Owner-scoped schema & RLS

#### Automated

- [x] 1.1 Migration file exists with four tables and RLS enabled — 6fe4a59
- [x] 1.2 `supabase/seed.sql` exists — 6fe4a59
- [x] 1.3 Local `npx supabase db reset` (or migrate) exits 0 — 6fe4a59
- [x] 1.4 `npm run lint` passes — 6fe4a59

#### Manual

- [x] 1.5 Studio shows RLS + four policies per table — 6fe4a59

### Phase 2: Types & gated product stubs

#### Automated

- [x] 2.1 `src/types.ts` exports TrainingGoal, Plan, PlanExercise, Session, SessionSet — 62d5dd3
- [x] 2.2 `PROTECTED_ROUTES` includes `/dashboard`, `/plans`, `/sessions` — 62d5dd3
- [x] 2.3 Placeholder pages exist for `/plans` and `/sessions` — 62d5dd3
- [x] 2.4 `npm run lint` passes — 62d5dd3
- [x] 2.5 `npm run build` passes — 62d5dd3

#### Manual

- [x] 2.6 Signed-out `/plans` and `/sessions` redirect to sign-in — 62d5dd3
- [x] 2.7 Signed-in placeholders render — 62d5dd3

### Phase 3: Ownership verification

#### Automated

- [x] 3.1 `verification.md` exists with two-user RLS and route-gate steps

#### Manual

- [ ] 3.2 Cross-user SELECT denied / empty
- [ ] 3.3 Cross-user INSERT denied
- [ ] 3.4 Anonymous product routes redirect to sign-in
- [ ] 3.5 Signed-in placeholders accessible
