# Edit Plan & Exercises — Plan Brief

> Full plan: `context/changes/edit-plan-exercises/plan.md`

## What & Why

FR-003 / S-03: let a logged-in user view and edit a generated plan (name + exercises) so the must-have path can move from a read-only AI artifact to a template they will actually log. Under `speed`, in-place edit on `/plans/[id]` — add/remove/delete with a 1–8 cap — without pulling session logging (S-04).

## Starting Point

S-02 already generates plans and shows a read-only detail page. F-01 already has owner RLS for UPDATE/DELETE and CASCADE from exercises to `session_sets`. There is no edit API, no editor island, and the AI generate schema (3–8 on the full payload) must not be reused for per-row PATCH.

## Desired End State

Owner opens `/plans/[id]`, tweaks name and lifts, adds (append) or removes exercises within 1–8, or deletes the plan after confirm. Goal stays a read-only label. Illegal counts never persist. Other users get 404 on stolen ids.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Mutation set | Fields + add/remove + delete plan | Enough for S-04 to log the real workout; skip reorder/goal change | Plan |
| Goal | Immutable | Goal is origin of generation, not a live field | Plan |
| Count bounds | 1–8 | Thin a generated plan; keep generate’s max; never empty | Plan |
| Delete / CASCADE | Confirm; keep CASCADE | F-01 already accepted CASCADE; no migration before S-04 has rows | Plan + Research |
| UX surface | In-place on `/plans/[id]` | Durable URL from S-02; one screen to review and tweak | Plan |
| Persist | Per-resource JSON APIs | Matches generate’s JSON island pattern; small saves | Plan |
| Add position | Append (`sort_order` max+1) | Avoids reorder UI | Plan |
| Verification | Manual `verification.md` | Same as S-02; no test runner | Plan |

## Scope

**In scope:** Plan name PATCH; exercise PATCH; add exercise; delete exercise (not last); delete plan; confirm UI; 401/404/409; `verification.md`.

**Out of scope:** Goal edit, AI regenerate, reorder, soft-delete/RESTRICT, sessions/progression, test runner, list-page delete, new migration.

## Architecture / Approach

SSR detail page keeps loading the plan. A `client:load` island calls cookie-authenticated JSON routes. Routes validate with zod, then services mutate through the SSR Supabase client so RLS + owner triggers apply. Load kg is coerced to a decimal string at persist. Cardinality is checked server-side (409).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Edit contracts & APIs | zod + services + PATCH/POST/DELETE | Reusing generate’s 3–8 schema; numeric load as number |
| 2. In-place editor | Island on detail; confirms | Skipping confirm; last-exercise delete only hidden in UI |
| 3. Manual verification | `verification.md` | Skipping cross-user 404 check |

**Prerequisites:** F-01 applied locally; signed-in user; at least one generated plan.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- After S-04, deleting an exercise will CASCADE-delete that lift’s set history — confirm copy is the mitigation, not a schema change.
- Two-browser race (delete last exercise twice) is handled by server 409, not locks.
- Plan names longer than 100 chars are rejected; AI max is already 100.

## Success Criteria (Summary)

- Owner can fix name and lifts and persist them
- Plans stay between 1 and 8 exercises
- Plan delete is confirmed and removes the plan from the list
- Unauthenticated and cross-user access cannot edit
