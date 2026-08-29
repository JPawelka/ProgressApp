<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit Plan & Exercises

- **Plan**: context/changes/edit-plan-exercises/plan.md
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-08-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria verification

| Check | Result |
|-------|--------|
| `npm run lint` | PASS with warnings (2026-08-29): `no-console` in `plan-edit.ts:73` (intentional persist log) and pre-existing `plan-generation.ts:102` |
| `npm run build` | PASS (2026-08-29) |
| Progress 1.1–1.10 | `[x]` — 028d700; human confirmed in session |
| Progress 2.1–2.10 | `[x]` — 5166ce4; human confirmed in session |
| Progress 3.1 | `[x]` — 0a72c59; `verification.md` present |
| Progress 3.2–3.5 | `[x]` — 0a72c59; attested from Phase 1–2 (no app code after 5166ce4); see F3 |

Phase 1 findings F1 (cardinality race) and F2 (persist leak) from `reviews/impl-review-phase-1.md` are already FIXED (RPC + generic 500). Not re-raised.

## Findings

### F1 — Plan delete leaves the island stuck busy on HTTP error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plans/EditPlanForm.tsx:214
- **Detail**: `deletePlan` sets `pending` to `"delete-plan"` but has no `finally`. On `!response.ok` it `return`s after `setConfirm(null)` and never clears `pending`, so Save / Add / Delete stay `disabled`. Network failures in `catch` do clear pending; HTTP 4xx/5xx do not. Sibling mutators all use `finally { setPending(null) }`. Success still navigates away, so `finally` on that path is harmless.
- **Fix**: Add `finally { setPending(null) }` and drop the `setPending(null)` in `catch`. Keep `window.location.href = "/plans"` on success.
- **Decision**: FIXED

### F2 — Failed exercise query still mounts the editor as an empty plan

- **Severity**: 💭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/plans/[id].astro:26
- **Detail**: If the plan row loads but `plan_exercises` select errors, `exerciseRows` stays `[]` and `EditPlanForm` still mounts. The owner sees zero exercises plus **Delete plan**. RPC still blocks a last-exercise delete if rows exist in DB; the UI is lying. Same swallow as the old read-only page; blast radius is higher now that delete exists.
- **Fix A ⭐ Recommended**: If `exercisesResult.error`, render an error/retry card instead of the editor.
  - Strength: Avoids a false empty plan and an easy wipe control on bad reads.
  - Tradeoff: New not-found-adjacent UI state; rare path (RLS/network).
  - Confidence: HIGH — the error object is already on the query result.
  - Blind spot: Have not simulated a PostgREST select failure in the browser.
- **Fix B**: Leave as inherited S-02 behavior; document in verification notes.
  - Strength: No extra page states.
  - Tradeoff: Empty list + Delete plan remains on a failed child query.
  - Confidence: MED — matches prior read-only page.
  - Blind spot: How often hosted select fails independently of plan SELECT.
- **Decision**: SKIPPED

### F3 — Phase 3 manual rows attested without a fresh pass

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/edit-plan-exercises/verification.md (pass/fail table)
- **Detail**: 3.2–3.5 were marked complete because no `src/` changes landed after `5166ce4` (Phase 2 UI already passed 2.4–2.10; isolation was 1.10). The table is filled Y with that note. Not rubber-stamping of untested code, but the Phase 3 human checklist was not re-executed after `verification.md` existed.
- **Fix**: Treat as accepted given the empty `src/` delta; optional re-run of `verification.md` before `/10x-archive`.
- **Decision**: SKIPPED
