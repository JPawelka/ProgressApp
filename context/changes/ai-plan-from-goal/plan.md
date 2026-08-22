# AI plan from goal — Implementation Plan

## Overview

Deliver FR-002 / roadmap S-02: a logged-in user picks a training goal (mass / strength / endurance), OpenRouter generates a structured exercise list, and ProgressApp persists a new `plans` row plus `plan_exercises` children, then shows a read-only plan detail page. Failures leave no partial rows. Edit UI stays in S-03.

## Current State Analysis

- F-01 shipped owner-scoped `plans` / `plan_exercises` (and session tables) with RLS, child-owner triggers, and TypeScript entities in `src/types.ts`.
- `/plans` is a middleware-gated placeholder (`PROTECTED_ROUTES` already covers `/plans/*` via prefix match). No domain APIs, services, or LLM wiring exist.
- Auth APIs use form POST + redirect; zod is required by repo rules but not installed; env schema only has Supabase secrets.
- Infrastructure assumes OpenRouter later; deployment checklist still defers `OPENROUTER_API_KEY`.
- Lesson prior: map Postgres `numeric` columns (`default_load_kg`) as `string | null` in entity types — already true in `src/types.ts`; keep that when inserting/reading.

## Desired End State

- Signed-in user on `/plans` can pick a goal and generate a plan via OpenRouter.
- On success, rows exist in `plans` + `plan_exercises` for that user; client lands on read-only `/plans/[id]` showing goal, name (if any), and ordered exercises.
- On LLM/validation/provider failure, API returns a clear error and **no** plan/exercise rows are inserted.
- Multiple plans per user are allowed (each generate inserts a new plan).
- `OPENROUTER_API_KEY` is declared in Astro env schema, documented in `.env.example`, surfaced in `config-status` when missing, and used only server-side.
- Manual verification checklist documents happy path (each goal) + one failure path; lint and build pass.

### Key Discoveries:

- Schema already matches MVP needs: `training_goal` enum + `plan_exercises` columns for `name`, `sort_order`, `default_reps`, `default_load_kg` (`supabase/migrations/20260811122333_owner_scoped_persistence.sql`).
- `/plans/[id]` needs no middleware change — `pathname.startsWith("/plans")` already gates detail routes (`src/middleware.ts`).
- Auth `SubmitButton` uses `useFormStatus()` (native form submit only). Generate island must use local `isSubmitting` + `fetch` (`src/components/auth/SubmitButton.tsx`).
- OpenRouter chat completions support `response_format.type = "json_schema"` for strict structured output; prefer raw `fetch` to `https://openrouter.ai/api/v1/chat/completions` (edge-safe, no SDK).
- Topbar links only to Dashboard and is not used on product placeholder pages — add a Plans entry where nav exists and ensure `/plans` is reachable from the signed-in shell.

## What We're NOT Doing

- Edit / delete plan or exercises (S-03)
- Session logging or progression (S-04 / S-05)
- Introducing a unit/e2e test runner
- OpenAI/Anthropic direct SDKs or streaming responses
- Soft deletes, plan sharing, or global exercise catalog
- Regenerating/replacing a single “active” plan (many plans allowed; no replace semantics)
- Pulling S-03 edit UI into this change

## Implementation Approach

Four phases: (1) env + zod + OpenRouter client + strict output schema/service (no DB write), (2) authenticated JSON generate API that validates then inserts plan + exercises, (3) generate UI + read-only detail + minimal list/nav, (4) manual verification doc and human checklist. Persist only after schema-valid AI output — never create an empty plan shell on failure.

## Critical Implementation Details

**No partial save:** Call OpenRouter and zod-parse the model payload **before** any Supabase insert. If the provider errors, times out, or returns invalid JSON/shape, return an API error without writing. If the plan insert succeeds but exercise inserts fail, delete the new plan (or use a single transactional approach if practical with the SSR client) so the user never sees an empty plan — prefer “delete plan on exercise insert failure” over leaving orphans.

**Numeric loads:** When mapping AI `default_load_kg` into inserts, store values compatible with `numeric(6,2)`; entity reads remain `string | null` per `src/types.ts` / lessons.md.

**Generate UX latency:** LLM calls are multi-second — JSON `fetch` + loading state on the island; do not use form-redirect for generate.

---

## Phase 1: AI + validation foundation

### Overview

Install zod, declare OpenRouter secrets, add a typed OpenRouter chat helper, and a service that turns a `TrainingGoal` into a zod-validated plan payload (name + 3–8 exercises) without touching the database.

### Changes Required:

#### 1. Dependency

**File**: `package.json`

**Intent**: Add zod for API body and AI output validation (required by repo conventions; first use in this codebase).

**Contract**: Add `zod` as a runtime dependency via the project’s normal package manager install.

#### 2. Env schema + examples

**Files**: `astro.config.mjs`, `.env.example`, `src/lib/config-status.ts`

**Intent**: Make `OPENROUTER_API_KEY` a first-class server secret and surface a missing-config banner like Supabase.

**Contract**:
- `astro.config.mjs` `env.schema`: `OPENROUTER_API_KEY` — `envField.string({ context: "server", access: "secret", optional: true })`
- `.env.example`: add `OPENROUTER_API_KEY=###` (and document mirroring into `.dev.vars` for workerd)
- `config-status.ts`: second status entry when key missing — generation disabled message (Polish or match existing banner tone)

#### 3. AI output + request schemas

**File**: `src/lib/plans/plan-generation-schema.ts` (or equivalent under `src/lib/`)

**Intent**: Single source of truth for goal input and strict AI plan shape.

**Contract**:
- Goal: `TrainingGoal` enum (`mass` | `strength` | `endurance`)
- AI plan object: optional/nullable `name`; `exercises` array length 3–8; each exercise: non-empty `name`, optional `default_reps` (positive int), optional `default_load_kg` (finite number → stored as numeric-compatible value)
- Export JSON Schema (or equivalent) suitable for OpenRouter `response_format.json_schema` with `strict: true` / `additionalProperties: false` as supported

#### 4. OpenRouter client

**File**: `src/lib/plans/openrouter.ts` (or `src/lib/ai/openrouter.ts`)

**Intent**: Thin server-only helper around OpenRouter chat completions for plan generation.

**Contract**:
- `POST https://openrouter.ai/api/v1/chat/completions` via native `fetch`
- Headers: `Authorization: Bearer <OPENROUTER_API_KEY>`, `Content-Type: application/json`; include OpenRouter app attribution headers (`HTTP-Referer`, `X-OpenRouter-Title` or current documented equivalents) with ProgressApp / deploy URL placeholders
- Body: model id (pick a cheap structured-output-capable default, e.g. an OpenRouter-routed small chat model — document the chosen id in code comment), messages instructing goal→plan, `response_format` with the plan JSON schema
- Timeouts / non-2xx / missing content → throw typed error (no swallow)
- No DB access in this module

#### 5. Generate service (LLM only)

**File**: `src/lib/services/plan-generation.ts` (create `src/lib/services/`)

**Intent**: Orchestrate “goal → OpenRouter → zod parse” for reuse by the API route.

**Contract**: `generatePlanFromGoal(goal: TrainingGoal): Promise<ValidatedPlanPayload>` — returns validated payload or throws/rejects on provider or validation failure. **Does not** insert into Supabase in Phase 1.

### Success Criteria:

#### Automated Verification:

- `zod` is listed in `package.json` dependencies
- `OPENROUTER_API_KEY` appears in `astro.config.mjs` env schema and `.env.example`
- OpenRouter helper + plan schemas + generation service modules exist under `src/lib/`
- `npm run lint` passes
- `npm run build` passes (with existing Supabase env; OpenRouter optional at build time)

#### Manual Verification:

- With key missing, config banner (or equivalent) indicates plan generation is unavailable
- With a real key in `.dev.vars`, a one-off server-side call path is ready for Phase 2 (no requirement to expose UI yet)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Generate API + persist

### Overview

Add `POST /api/plans/generate`: require auth, validate body with zod, call the generation service, insert `plans` + `plan_exercises` only after success, return JSON `{ planId }` or a clear error. No partial saves.

### Changes Required:

#### 1. Generate API route

**File**: `src/pages/api/plans/generate.ts`

**Intent**: Authenticated JSON endpoint that creates a plan from a goal via AI.

**Contract**:
- `export const prerender = false`
- `export const POST`
- Create Supabase SSR client; if missing config or no user → `401`/`503` JSON (not redirect)
- Body JSON: `{ goal: TrainingGoal }` validated with zod; `400` on invalid
- If `OPENROUTER_API_KEY` missing → clear `503`/`500` JSON (generation unavailable)
- Call generation service; on failure → error JSON, **no** inserts
- On success: insert `plans` (`user_id`, `goal`, `name`), then insert `plan_exercises` (`user_id`, `plan_id`, `name`, `sort_order`, optional defaults). On exercise insert failure, delete the plan row and return error
- Success: `200` JSON `{ planId: string }` (uuid)
- Do not return raw provider payloads to the client

#### 2. Wire service persistence (extend Phase 1 service or adjacent module)

**File**: `src/lib/services/plan-generation.ts` (and/or `src/lib/services/plans.ts`)

**Intent**: Keep route thin — business flow “generate then persist” lives in `src/lib/services/`.

**Contract**: Function(s) accepting Supabase client + user id + goal; return `planId`. Inserts set `user_id` to the authenticated user so RLS `WITH CHECK` passes. `sort_order` is contiguous from 0 (or 1) matching array order.

### Success Criteria:

#### Automated Verification:

- `src/pages/api/plans/generate.ts` exports `prerender = false` and `POST`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Authenticated `POST` with valid goal and real OpenRouter key returns `{ planId }` and Studio/SQL shows plan + 3–8 exercises for that user
- Invalid body returns `400` with no new rows
- Forced provider failure (bad key) returns error JSON with no new rows
- Unauthenticated `POST` is rejected (401) with no new rows

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Plans UI (generate + read-only detail)

### Overview

Replace the `/plans` placeholder with a generate island and a minimal list of the user’s plans; add read-only `/plans/[id]`; make Plans reachable from signed-in navigation.

### Changes Required:

#### 1. Generate island

**File**: `src/components/plans/GeneratePlanForm.tsx` (name flexible)

**Intent**: Client UI to pick a goal, call the generate API, show loading/errors, navigate to the new plan detail on success.

**Contract**:
- React island; mount with `client:load` from Astro
- Goal control constrained to mass / strength / endurance
- `fetch("POST /api/plans/generate")` with JSON body; local pending state (do not rely on `useFormStatus`)
- Reuse existing error/button patterns where practical (`ServerError`, shadcn `Button` / `cn`)
- On success: `window.location` (or Astro-friendly nav) to `/plans/{planId}`
- On error: show message; stay on page; no optimistic local “fake plan”

#### 2. Plans index

**File**: `src/pages/plans/index.astro`

**Intent**: Signed-in home for plans — generate + list existing plans (many plans allowed).

**Contract**:
- Server-load current user’s plans (id, goal, name, created_at) ordered newest first via Supabase SSR client + RLS
- Render `GeneratePlanForm` island
- List links to `/plans/[id]`; empty state when none exist
- Remove “placeholder / no CRUD” copy

#### 3. Plan detail (read-only)

**File**: `src/pages/plans/[id].astro`

**Intent**: Show one owned plan and its exercises; no edit controls.

**Contract**:
- Load plan by `id` for current user; if missing/unauthorized → redirect to `/plans` or 404-equivalent signed-in handling
- Load `plan_exercises` for that plan ordered by `sort_order`
- Display goal, name (or fallback label), exercise list with reps/load when present
- No edit/delete UI

#### 4. Navigation affordance

**Files**: `src/components/Topbar.astro` and/or product page shells (`dashboard.astro`, plans pages)

**Intent**: Signed-in users can reach `/plans` without typing the URL.

**Contract**: Add a Plans link in the existing Topbar and/or mirrored nav on dashboard/plans shells so the generate flow is discoverable. Keep styling consistent with Dashboard link.

### Success Criteria:

#### Automated Verification:

- `src/pages/plans/[id].astro` and generate island component exist
- `/plans` index is no longer placeholder-only
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Signed-in: open `/plans`, generate for a goal, land on detail with exercises visible
- Signed-in: return to `/plans`, see the new plan in the list, reopen detail
- Signed-out: `/plans` and `/plans/<id>` redirect to sign-in
- Generate error path shows an in-UI error and does not navigate away

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Manual verification

### Overview

Document repeatable checks for FR-002 (happy path per goal + failure path) so the change can close without a test runner.

### Changes Required:

#### 1. Verification checklist

**File**: `context/changes/ai-plan-from-goal/verification.md`

**Intent**: Capture prerequisites and pass/fail steps for human verification (mirror F-01 style).

**Contract**: Include:
1. Prerequisites: local Supabase up, migrations applied, `.dev.vars` with Supabase + `OPENROUTER_API_KEY`, signed-in test user
2. Happy path: generate once for `mass`, `strength`, and `endurance` — each yields detail page + DB rows (3–8 exercises)
3. Failure path: temporarily break/remove OpenRouter key (or force invalid key) — UI/API error, no new plan row
4. Auth gate: anonymous `/plans` → sign-in
5. Multi-plan: two generates → two list entries, distinct detail URLs
6. Pass/fail checklist for the human to tick

Optional note: production `wrangler secret put OPENROUTER_API_KEY` when enabling AI on the deployed Worker (align with deployment-plan deferred checklist).

### Success Criteria:

#### Automated Verification:

- `context/changes/ai-plan-from-goal/verification.md` exists with the steps above

#### Manual Verification:

- Happy path checklist completed for all three goals
- Failure path confirmed (error, no partial row)
- Multi-plan list behavior confirmed
- Anonymous gate still redirects

**Implementation Note**: This phase is primarily human verification. Do not mark the change complete until the manual checklist in `verification.md` is satisfied.

---

## Testing Strategy

### Unit Tests:

- None — do not introduce a test runner in this change (decision: manual verification).

### Integration Tests:

- None automated. Provider + DB path proven via `verification.md`.

### Manual Testing Steps:

1. Configure `.dev.vars` with Supabase + OpenRouter; `npm run dev`
2. Sign in → `/plans` → generate each goal → inspect detail + Studio rows
3. Break OpenRouter key → generate → expect error, no new plan
4. Sign out → hit `/plans` → sign-in redirect
5. Generate twice → two list entries

## Performance Considerations

OpenRouter + edge hop adds multi-second latency — acceptable for MVP (`infrastructure.md`). Keep prompts short; one completion per generate; no streaming. No caching of plans in this slice.

## Migration Notes

No new SQL migration expected — F-01 tables are sufficient. If hosted Supabase lacks F-01 schema, apply existing migration before testing generate. Worker runtime needs `OPENROUTER_API_KEY` via `wrangler secret put` when AI is enabled in production (deploy checklist currently deferred).

## References

- PRD FR-002: `context/foundation/prd.md`
- Roadmap S-02: `context/foundation/roadmap.md`
- F-01 schema/plan: `context/archive/2026-08-11-gate-product-routes/plan.md`
- Types: `src/types.ts`
- Lessons (numeric): `context/foundation/lessons.md`
- OpenRouter structured outputs: https://openrouter.ai/docs/structured-outputs
- Infrastructure / OpenRouter assumption: `context/foundation/infrastructure.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: AI + validation foundation

#### Automated

- [x] 1.1 `zod` is listed in `package.json` dependencies — 08dd6a7
- [x] 1.2 `OPENROUTER_API_KEY` appears in `astro.config.mjs` env schema and `.env.example` — 08dd6a7
- [x] 1.3 OpenRouter helper + plan schemas + generation service modules exist under `src/lib/` — 08dd6a7
- [x] 1.4 `npm run lint` passes — 08dd6a7
- [x] 1.5 `npm run build` passes (with existing Supabase env; OpenRouter optional at build time) — 08dd6a7

#### Manual

- [x] 1.6 With key missing, config banner (or equivalent) indicates plan generation is unavailable — 08dd6a7
- [x] 1.7 With a real key in `.dev.vars`, a one-off server-side call path is ready for Phase 2 (no requirement to expose UI yet) — 08dd6a7

### Phase 2: Generate API + persist

#### Automated

- [x] 2.1 `src/pages/api/plans/generate.ts` exports `prerender = false` and `POST` — 4491395
- [x] 2.2 `npm run lint` passes — 4491395
- [x] 2.3 `npm run build` passes — 4491395

#### Manual

- [x] 2.4 Authenticated `POST` with valid goal and real OpenRouter key returns `{ planId }` and Studio/SQL shows plan + 3–8 exercises for that user — 4491395
- [x] 2.5 Invalid body returns `400` with no new rows — 4491395
- [x] 2.6 Forced provider failure (bad key) returns error JSON with no new rows — 4491395
- [x] 2.7 Unauthenticated `POST` is rejected (401) with no new rows — 4491395

### Phase 3: Plans UI (generate + read-only detail)

#### Automated

- [x] 3.1 `src/pages/plans/[id].astro` and generate island component exist
- [x] 3.2 `/plans` index is no longer placeholder-only
- [x] 3.3 `npm run lint` passes
- [x] 3.4 `npm run build` passes

#### Manual

- [x] 3.5 Signed-in: open `/plans`, generate for a goal, land on detail with exercises visible
- [x] 3.6 Signed-in: return to `/plans`, see the new plan in the list, reopen detail
- [x] 3.7 Signed-out: `/plans` and `/plans/<id>` redirect to sign-in
- [x] 3.8 Generate error path shows an in-UI error and does not navigate away

### Phase 4: Manual verification

#### Automated

- [ ] 4.1 `context/changes/ai-plan-from-goal/verification.md` exists with the steps above

#### Manual

- [ ] 4.2 Happy path checklist completed for all three goals
- [ ] 4.3 Failure path confirmed (error, no partial row)
- [ ] 4.4 Multi-plan list behavior confirmed
- [ ] 4.5 Anonymous gate still redirects
