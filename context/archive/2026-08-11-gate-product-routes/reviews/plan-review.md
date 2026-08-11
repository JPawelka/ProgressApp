<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Owner-scoped persistence & gated product routes

- **Plan**: context/changes/gate-product-routes/plan.md
- **Mode**: Deep
- **Date**: 2026-08-11
- **Verdict**: REVISE → SOUND (after triage fixes)
- **Findings**: 1 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict (pre-triage) | After triage |
|-----------|----------------------|--------------|
| End-State Alignment | FAIL | PASS (F1 fixed) |
| Lean Execution | PASS | PASS |
| Architectural Fitness | PASS | PASS |
| Blind Spots | WARNING | PASS (F2 fixed; F4 fixed) |
| Plan Completeness | WARNING | WARNING (F3 skipped; residual underspec OK) |

## Grounding

Grounding: 5/5 existing paths ✓, create-targets correctly absent ✓, 3/3 symbols ✓, brief↔plan ✓

## Plan edits applied during triage

1. **F1 Fix A** — Critical Details + Phase 1 Triggers: require `sessions.user_id` match `plans.user_id` for `plan_id`.
2. **F2 Fix A** — Critical Details + Phase 1 Triggers: require `session_sets` exercise `plan_id` equals session `plan_id`.
3. **F4 Fix** — Phase 2 README contract: also update Auth routes table with `/plans` and `/sessions`.

## Findings

### F1 — `sessions` missing parent-owner consistency trigger

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Critical Implementation Details + Phase 1 contract
- **Detail**: RLS alone lets User B insert a `sessions` row with their `user_id` and User A’s `plan_id`. Triggers covered `plan_exercises` / `session_sets` but not `sessions`, leaving plan-lineage isolation incomplete.
- **Fix A ⭐ Recommended**: Add BEFORE INSERT OR UPDATE trigger for `sessions` so `NEW.user_id = plans.user_id` for `NEW.plan_id`
  - Strength: Closes the same hole named for other children; aligns Phase 1 with Critical Details and Phase 3.
  - Tradeoff: Slightly more trigger SQL.
  - Confidence: HIGH — same pattern as `plan_exercises`.
  - Blind spot: None significant.
- **Fix B**: Keep triggers on exercise/set children only; document sessions hole as accepted in Phase 3
  - Strength: Smaller Phase 1 surface.
  - Tradeoff: Real ownership bypass until a later slice.
  - Confidence: LOW — contradicts the plan’s own isolation rule.
  - Blind spot: Later inserts may bake in bad `plan_id` associations.
- **Decision**: FIXED via Fix A

### F2 — `session_sets` can attach an exercise from a different plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `session_sets` FKs + Critical Details
- **Detail**: Nothing required `plan_exercises.plan_id = sessions.plan_id`, so same-owner multi-plan users could log sets against the wrong plan’s exercises while owner triggers still pass.
- **Fix A ⭐ Recommended**: Extend `session_sets` trigger to assert exercise’s `plan_id` equals session’s `plan_id`
  - Strength: Cheap at insert time; prevents corrupt history before S-04.
  - Tradeoff: Slightly more complex trigger (two parent lookups).
  - Confidence: HIGH — FK pair already implies this invariant.
  - Blind spot: UPDATE of FKs must re-check (BEFORE INSERT OR UPDATE covers it).
- **Fix B**: Defer to S-03/S-04; document as known Phase 1 gap
  - Strength: Keeps F-01 thinner.
  - Tradeoff: Risk of bad rows if insert paths appear before the check.
  - Confidence: MEDIUM — only safe if no insert API lands first.
  - Blind spot: Ad-hoc SQL during verification could still create bad pairs.
- **Decision**: FIXED via Fix A

### F3 — Trigger predicates underspecified for implementer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Triggers bullet
- **Detail**: Phase 1 originally said “match parent owner” without spelling exact checks. After F1/F2, Critical Details and Triggers bullet list the predicates; remaining gap was only RAISE/INSERT+UPDATE behavior note.
- **Fix**: Add one-line note that each consistency trigger is BEFORE INSERT OR UPDATE, looks up parent, RAISE EXCEPTION on mismatch.
- **Decision**: SKIPPED — F1/F2 edits considered sufficient

### F4 — README Auth routes table still `/dashboard` only

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — README persistence note
- **Detail**: Plan updated the “auth.users only / no migrations” sentence but left the Auth routes table listing only `/dashboard`. Docs-only drift; no runtime effect.
- **Fix**: When editing README.md, also add `/plans` and `/sessions` to that Auth routes table.
- **Decision**: FIXED — Phase 2 README contract extended
