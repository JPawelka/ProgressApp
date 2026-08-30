# Progression Suggest Override — Implementation Plan

## Overview

Deliver FR-005 / FR-006 / US-01 (roadmap S-05, the north star): after a logged-in user saves a training session, show a per-exercise progression suggestion (increase / hold / deload + a load) they can accept or override. Saving writes the chosen loads onto `plan_exercises.default_load_kg` so the next log prefills them. Skipping leaves defaults unchanged.

## Current State Analysis

- S-04 is shipped: `POST /api/plans/[id]/sessions` calls `log_training_session`, persists only complete sets, and requires ≥1 set. Skipped exercises leave zero `session_sets` rows. After 201, `LogSessionForm` ignores `{ session }` and hard-redirects to `/sessions` (`src/components/sessions/LogSessionForm.tsx`).
- There is no progression table, service, API, page, or rule. `plan_exercises.default_load_kg` is a template for log prefill; logging never updates it.
- Exercise `PATCH` is a full-row write (`name`, `default_reps`, `default_load_kg`) via `exerciseWriteSchema`. It is the wrong apply path: clients would have to echo name/reps, and N PATCHes can partially succeed.
- Loads are Postgres `numeric(6,2)` and `string | null` on entities (`src/types.ts`). Coerce with `Number()` only at calc/display boundaries (`context/foundation/lessons.md`).
- `/sessions/*` is already auth-gated by middleware prefix. Session list rows are not links. No test runner; CI is lint + build only. UI pattern is SSR page + `client:load` island, `Button` + inline panel, client `fetch` JSON.

## Desired End State

- Saving a session lands on `/sessions/[sessionId]/suggestion`. Each **logged** exercise shows a decision (increase / hold / deload) and a kg field prefilled with the suggested load. Skipped lifts are omitted.
- **Accept all** writes the suggested loads. **Save** writes the kg values currently in the fields (override = edit then Save). Both then go to `/sessions`.
- **Skip** (or any navigation away without Save) leaves `default_load_kg` unchanged. The session row already exists.
- The next log on that plan prefills from the new defaults. Unauthenticated suggestion/apply routes still redirect or 401. Stolen session ids 404 and do not update another user’s plan.
- The pure rule is unit-tested. CI runs `npm test` (`vitest run`) after lint.

### Key Discoveries:

- S-04 deferred this slice explicitly: after save → `/sessions`; skipped lifts must be tolerated (`context/archive/2026-08-29-log-training-session/plan-brief.md`).
- 201 already returns `{ session }` with `id`; the form just never reads it (`src/pages/api/plans/[id]/sessions.ts`).
- Multi-row writes in this repo go through RPCs (`log_training_session`, cardinality RPCs) because Worker-side loops are not atomic. Apply must follow that pattern, not N PATCHes.
- Astro 6 Vitest must use `environment: 'node'`. Use `getViteConfig()` from `astro/config` so `@/` aliases match the app.

## What We're NOT Doing

- A suggestion / accept-override audit table (no 70% accept metric yet)
- Reopening suggestions from the session list or a next-load preview on the plan page
- Goal-specific formulas (mass / strength / endurance)
- Advanced periodization, RPE, backoff-set awareness, plate rounding beyond 2 decimals
- Updating `default_reps` or exercise names from this flow
- Editing or deleting past sessions
- Linking `/sessions` list rows to the suggestion page
- shadcn Dialog / toast packages
- API/handler tests beyond the pure rule (no Playwright)

## Implementation Approach

Three phases: (1) lock the rule as a pure function with Vitest + CI, (2) post-log screen that **shows** suggestions (Skip works; fields not persisted yet), (3) Save / Accept all via one transactional RPC that updates only `default_load_kg` for exercises that appear in that session.

Compute on SSR from the session just logged plus current `default_reps`. Do not persist the suggestion itself. The island is a form over server-computed rows.

## Critical Implementation Details

**The session is already committed before this screen.** Log stays S-04’s RPC. Suggestion is a later GET of that session. Skip must not write plan defaults. Save is a separate POST.

**Do not use `PATCH /api/plans/[id]/exercises/[exerciseId]` to apply.** It requires name + reps + load and is one row per request. Apply is a new RPC that updates only `default_load_kg` for exercises that have `session_sets` on this session.

**The rule reads session sets + `default_reps`, never current `default_load_kg`.** Increase is heaviest logged load + 2.5 kg. Saving twice writes the same number (idempotent). Coerce `load_kg` strings with `Number()` before the rule; do not change entity types.

**`LogSessionForm` must parse the 201 body for `session.id`.** Redirect to `/sessions/{id}/suggestion`. If the body has no id, stay on the log form with an error — do not fall back to `/sessions` and skip the north-star screen.

---

## Phase 1: Progression rule + Vitest

### Overview

Encode the locked rule as a pure function and prove it with unit tests. Introduce Vitest and a CI test step. No UI, no API, no migration.

### Changes Required:

#### 1. Rule module

**File**: `src/lib/progression/progression-rule.ts` (new)

**Intent**: Single source of truth for increase / hold / deload + suggested load, callable from the SSR page later with no I/O.

**Contract**:
- Input: exercises `{ id, name, default_reps }` and sets `{ plan_exercise_id, reps, load_kg }` (numbers already coerced; drop non-finite loads/reps).
- Output: one row per exercise that has ≥1 valid set, in the input exercise order. Omit exercises with zero sets.
- Per exercise, `heaviest` = max `load_kg` among its sets.
- If `default_reps` is null → `hold`, suggested = `heaviest`.
- Else, each set is a hit when `reps >= default_reps`:
  - all hit → `increase`, suggested = `heaviest + 2.5`
  - all miss → `deload`, suggested = `heaviest * 0.9`
  - mixed → `hold`, suggested = `heaviest`
- Round suggested load to 2 decimal places; clamp to `[0, 9999.99]`.
- Decision union: `"increase" | "hold" | "deload"`. Export shared types used by the page/island (or add them in `src/types.ts` if they are DTOs other modules import).

#### 2. Unit tests

**File**: `src/lib/progression/progression-rule.test.ts` (new)

**Intent**: Lock the cases we decided in planning so a later UI change cannot silently alter the math.

**Contract**: Cover at least: all-hit increase from heaviest; all-miss deload; mixed hold; null `default_reps` → hold at heaviest; skipped exercise (no sets) omitted; mixed loads still increase from heaviest when every set hits; clamp at 9999.99; deload of 0 stays 0; rounding to 2 decimals (e.g. 82.5 × 0.9). Import `test` / `expect` from `vitest` (no globals).

#### 3. Vitest + CI + agent docs

**Files**: `vitest.config.ts` (new), `package.json`, `.github/workflows/ci.yml`, `AGENTS.md`, `CLAUDE.md`

**Intent**: Tests run in Node (Astro 6), pick up `@/` via Astro’s Vite config, and run in CI. Docs stop saying there is no test runner.

**Contract**:
- DevDependency `vitest`. Config uses `getViteConfig` from `astro/config` with `test.environment: "node"`.
- Script `"test": "vitest run"` (CI must not start watch mode).
- CI: after `npm run lint`, before `npm run build`, run `npm test` (no extra secrets).
- `CLAUDE.md` Commands: add `npm test`. `AGENTS.md`: replace “no unit/e2e test runner yet” and “lint + build only” with lint → test → build. Do not add Playwright.

### Success Criteria:

#### Automated Verification:

- `npm test` (`vitest run`) passes, including the cases listed in the test contract
- `vitest.config.ts` uses `getViteConfig` and `environment: "node"`
- CI workflow runs `npm test` after lint and before build
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- `AGENTS.md` / `CLAUDE.md` mention `npm test` so a later agent does not skip it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Post-log suggestion screen

### Overview

After a successful log, send the owner to a suggestion page that shows the Phase 1 rule output. Skip goes to `/sessions` without writing defaults. Kg fields are visible but not persisted until Phase 3.

### Changes Required:

#### 1. Redirect after log

**File**: `src/components/sessions/LogSessionForm.tsx`

**Intent**: The north-star screen is the next step after save, not the session list.

**Contract**: On 201, parse JSON `{ session: { id } }` (uuid string). Navigate to `/sessions/{id}/suggestion`. If `ok` but `id` is missing, show an error and stay. Do not redirect to `/sessions` on success.

#### 2. Suggestion page (SSR)

**File**: `src/pages/sessions/[id]/suggestion.astro` (new)

**Intent**: Load the owner’s session, its sets, and the plan’s exercises; run the rule; render the island. Mirror `log.astro` empty/not-found treatment.

**Contract**:
- Default SSR (no `prerender` export needed on pages). Auth is already covered by `PROTECTED_ROUTES` `/sessions` prefix.
- Load `sessions` by `id` (RLS = owner). Missing → not-found card, link to `/sessions`.
- Load `session_sets` for that session and `plan_exercises` for `session.plan_id` ordered by `sort_order`.
- Coerce `load_kg` with `Number()`; pass numbers into `suggestProgression`.
- Pass computed rows into a React island with `client:load`. Do not re-run the rule in the island.
- Not-found / load-failure copy matches existing glass cards (`log.astro`).

#### 3. Suggestion island (display)

**File**: `src/components/sessions/SuggestionForm.tsx` (new)

**Intent**: Show one row per logged exercise: name, decision, kg input prefilled with the suggestion. Skip must work before apply exists.

**Contract**:
- Visual language matches log/edit islands (`rounded-2xl border … backdrop-blur-xl`, `Button`, `cn()`).
- Decision is a visible label (`Increase` / `Hold` / `Deload`), not a control.
- Kg fields are editable in the DOM (override UX) but Phase 2 has **no** POST. Hide or disable **Save** / **Accept all** until Phase 3, or render them disabled with a short “coming next” is **not** required — omit those buttons in this phase.
- **Skip** is a link to `/sessions` (not a fetch).
- Reuse `ServerError` only if the page itself failed; the island has no submit yet.

### Success Criteria:

#### Automated Verification:

- Suggestion page file exists at `src/pages/sessions/[id]/suggestion.astro`
- `LogSessionForm` success path navigates to `/sessions/{id}/suggestion` using the 201 `session.id`
- `npm run lint` passes
- `npm run build` passes
- `npm test` still passes

#### Manual Verification:

- Sign in, log a session with at least two exercises (one with all sets ≥ default reps, one that misses): land on the suggestion page with matching Increase / Deload (or Hold) labels and prefilled kg
- An exercise left blank on the log form does not appear on the suggestion page
- Skip returns to `/sessions`; Studio (or plan edit) shows `default_load_kg` unchanged
- Signed-out `/sessions/{id}/suggestion` redirects to sign-in
- Another user’s session id shows the not-found card and does not leak names

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Apply chosen loads

### Overview

Wire **Save** and **Accept all** so chosen kg values become the plan’s `default_load_kg`. Then redirect to `/sessions`. One RPC, all-or-nothing, only for exercises that were logged in that session.

### Changes Required:

#### 1. Apply RPC

**File**: `supabase/migrations/YYYYMMDDHHmmss_apply_progression_loads_rpc.sql` (new)

**Intent**: Update several `default_load_kg` values in one transaction so a mid-loop failure cannot leave a half-applied plan. Follow `log_training_session` (invoker, `auth.uid()`, lock owner row, `NOTIFY pgrst`).

**Contract**:
- `apply_progression_loads(p_session_id uuid, p_loads jsonb) RETURNS void` (or returns the session id — pick one and stick to it in the service).
- `SECURITY INVOKER`, `search_path = public`.
- Lock the session row `FOR UPDATE` where `id = p_session_id AND user_id = auth.uid()`; not found → `RAISE EXCEPTION 'Not found'`.
- `p_loads` is a JSON array of `{ plan_exercise_id, load_kg }`. Empty / not an array → validation exception.
- Each `load_kg` is required numeric 0–9999.99. Duplicate `plan_exercise_id` in the payload → validation exception.
- The set of `plan_exercise_id` in the payload must **equal** the set of exercises that have ≥1 `session_sets` row on this session (no extras for skipped lifts, no missing logged lifts).
- Each id must belong to `session.plan_id` and `user_id = auth.uid()`.
- `UPDATE plan_exercises SET default_load_kg = …` only — do not touch `name` or `default_reps`.
- `GRANT EXECUTE` to `authenticated`; `REVOKE` from `PUBLIC`; `NOTIFY pgrst, 'reload schema'`.
- Apply on the database in `.dev.vars` `SUPABASE_URL` (hosted SQL Editor if that URL is `*.supabase.co`).

#### 2. Apply schema + service + POST

**Files**: `src/lib/progression/progression-apply-schema.ts` (new), `src/lib/services/progression-apply.ts` (new), `src/pages/api/sessions/[id]/progression.ts` (new)

**Intent**: Thin authenticated POST; zod at the boundary; RPC for persist. Same error mapping style as `session-log.ts`.

**Contract**:
- Body `{ loads: [{ plan_exercise_id: uuid, load_kg: number 0–9999.99 }] }` `.strict()`, min 1.
- `export const prerender = false`; `POST` only; `requirePlanApiAuth` / `parseJsonBody` / `json` from `src/lib/plans/plan-api.ts`.
- Session id from the URL, not the body.
- Success `{ ok: true }` 200.
- Not found / not owner → 404 `{ error: "Not found" }` and no updates.
- Zod fail → 400 `{ error, details }`. RPC validation → 400. Persist → 500 `"Failed to save progression"` with `console.error` of the real message.
- Do not call `updateExercise` / exercise PATCH from this path.

#### 3. Island submit

**File**: `src/components/sessions/SuggestionForm.tsx`

**Intent**: Accept all posts the original suggestions; Save posts the current field values; both then go to `/sessions`.

**Contract**:
- **Accept all**: POST the server-provided `suggested_load_kg` per row (ignore in-progress edits).
- **Save**: POST parsed kg from the inputs (same complete-load rules as the log form: finite, 0–9999.99). Incomplete/invalid field → inline error, no navigate.
- On 2xx: `window.location.href = "/sessions"`.
- On 4xx/5xx: `ServerError`, stay on the page.
- **Skip** remains a link with no POST.
- Pending state disables both buttons (same `Loader2` pattern as `LogSessionForm`).

### Success Criteria:

#### Automated Verification:

- RPC migration file exists under `supabase/migrations/`
- New API module exports `prerender = false` and `POST`
- `npm run lint` passes
- `npm run build` passes
- `npm test` still passes

#### Manual Verification:

- Accept all after an increase suggestion: that exercise’s `default_load_kg` becomes heaviest+2.5 (2 decimals); next log prefills it
- Edit a kg then Save: plan default matches the edited number, not the original suggestion
- Skip still leaves defaults unchanged
- Save a second time on the same suggestion URL writes the same loads (no extra +2.5)
- Unauthenticated POST → 401; another user’s session id → 404 and no writes
- Payload that includes a skipped exercise or omits a logged one → 400 and no writes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Pure rule only (`progression-rule.test.ts`): hit/miss/mixed, null target, omitted lifts, mixed loads, clamp, zero-load deload, 2-decimal rounding.

### Integration Tests:

- None automated. RPC + RLS proven via Phase 3 manual steps (same as S-04).

### Manual Testing Steps:

1. `npm run dev`; sign in; open a plan with known `default_reps` / `default_load_kg`.
2. Log: hit all reps on one exercise, miss all on another, leave a third blank.
3. Confirm suggestion page: Increase / Deload / omitted third; Skip → defaults unchanged.
4. Log again (or reuse the URL): Accept all → Studio/plan edit shows new loads; open log form and confirm prefill.
5. Log again: change one kg, Save, confirm only that default changed.
6. Sign out and hit the suggestion URL; second account POST/GET a stolen session id.

## Performance Considerations

MVP volume is small (≤8 exercises, ≤8 sets). One SSR read of session + sets + exercises; one RPC on Save. Do not autosave on keystroke. Do not query prior sessions — the locked rule uses only the session just logged.

## Migration Notes

Phase 3 adds `apply_progression_loads`. No new tables. F-01 RLS on `plan_exercises` UPDATE already allows the owner; the RPC still uses `auth.uid()` and must not be `SECURITY DEFINER`. Hosted projects must run this SQL; a schema-cache miss looks like `Could not find the function public.apply_progression_loads`.

Existing `default_load_kg` values stay until the owner Saves on a suggestion screen. Historical sessions are readable; visiting `/sessions/{id}/suggestion` for an old session computes the live rule against **current** `default_reps` (not advertised from the list).

## References

- PRD US-01, FR-005, FR-006, Business Logic: `context/foundation/prd.md`
- Roadmap S-05: `context/foundation/roadmap.md`
- S-04 (feed + deferrals): `context/archive/2026-08-29-log-training-session/plan.md`
- F-01 schema / RLS: `supabase/migrations/20260811122333_owner_scoped_persistence.sql`
- Log RPC: `supabase/migrations/20260829121500_log_training_session_rpc.sql`
- Types / numeric lesson: `src/types.ts`, `context/foundation/lessons.md`
- Auth helper: `src/lib/plans/plan-api.ts`
- Log form redirect: `src/components/sessions/LogSessionForm.tsx`
- Vitest + Astro 6: `getViteConfig` from `astro/config`; `test.environment: "node"`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Progression rule + Vitest

#### Automated

- [x] 1.1 `npm test` (`vitest run`) passes, including the cases listed in the test contract — fbbbca0
- [x] 1.2 `vitest.config.ts` uses `getViteConfig` and `environment: "node"` — fbbbca0
- [x] 1.3 CI workflow runs `npm test` after lint and before build — fbbbca0
- [x] 1.4 `npm run lint` passes — fbbbca0
- [x] 1.5 `npm run build` passes — fbbbca0

#### Manual

- [x] 1.6 `AGENTS.md` / `CLAUDE.md` mention `npm test` so a later agent does not skip it — fbbbca0

### Phase 2: Post-log suggestion screen

#### Automated

- [x] 2.1 Suggestion page file exists at `src/pages/sessions/[id]/suggestion.astro`
- [x] 2.2 `LogSessionForm` success path navigates to `/sessions/{id}/suggestion` using the 201 `session.id`
- [x] 2.3 `npm run lint` passes
- [x] 2.4 `npm run build` passes
- [x] 2.5 `npm test` still passes

#### Manual

- [x] 2.6 Sign in, log a session with at least two exercises (one with all sets ≥ default reps, one that misses): land on the suggestion page with matching Increase / Deload (or Hold) labels and prefilled kg
- [x] 2.7 An exercise left blank on the log form does not appear on the suggestion page
- [x] 2.8 Skip returns to `/sessions`; Studio (or plan edit) shows `default_load_kg` unchanged
- [x] 2.9 Signed-out `/sessions/{id}/suggestion` redirects to sign-in
- [x] 2.10 Another user’s session id shows the not-found card and does not leak names

### Phase 3: Apply chosen loads

#### Automated

- [ ] 3.1 RPC migration file exists under `supabase/migrations/`
- [ ] 3.2 New API module exports `prerender = false` and `POST`
- [ ] 3.3 `npm run lint` passes
- [ ] 3.4 `npm run build` passes
- [ ] 3.5 `npm test` still passes

#### Manual

- [ ] 3.6 Accept all after an increase suggestion: that exercise’s `default_load_kg` becomes heaviest+2.5 (2 decimals); next log prefills it
- [ ] 3.7 Edit a kg then Save: plan default matches the edited number, not the original suggestion
- [ ] 3.8 Skip still leaves defaults unchanged
- [ ] 3.9 Save a second time on the same suggestion URL writes the same loads (no extra +2.5)
- [ ] 3.10 Unauthenticated POST → 401; another user’s session id → 404 and no writes
- [ ] 3.11 Payload that includes a skipped exercise or omits a logged one → 400 and no writes
