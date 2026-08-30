<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Progression Suggest Override

- **Plan**: context/changes/progression-suggest-override/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-08-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Suggestion UI and apply RPC disagree on “logged” exercises

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/sessions/[id]/suggestion.astro:26
- **Detail**: The page only shows exercises that have ≥1 set with non-null finite `load_kg`/`reps`. The RPC requires the POST `loads` id set to equal every distinct `session_sets.plan_exercise_id`. `log_training_session` rejects null loads, so the product write path stays aligned. Direct Studio (or any future writer) can still insert null `load_kg`/`reps`; then the island omits that row and Save/Accept returns 400 with no way to apply the visible rows. Plan 3.11 already expects omit-a-logged-id → 400; the mismatch is the UI silently dropping a row the RPC still considers logged.
- **Fix A ⭐ Recommended**: Keep the RPC set-equality as the source of truth. On SSR, include every distinct `session_sets.plan_exercise_id` in the island payload (hold / skip-placeholder if coerce failed) so Save always posts the RPC-required set.
  - Strength: One invariant at the write boundary; matches plan 3.11 and the lock/EXCEPT in the migration.
  - Tradeoff: Island must render rows the rule currently omits (or post them without showing a kg field).
  - Confidence: HIGH — RPC already documents the set; log RPC is the only app writer today.
  - Blind spot: No production rows with null `session_sets.load_kg` were inspected.
- **Fix B**: Change the RPC to the same “≥1 coercible set” definition the page uses.
  - Strength: Matches the north-star copy (“skipped lifts omitted”) without extra UI rows.
  - Tradeoff: A second definition of “logged” in SQL; Studio-inserted null sets become silently ignored on apply.
  - Confidence: MEDIUM — needs a new migration on hosted projects that already ran the current SQL.
  - Blind spot: Whether any hosted sessions already have null set columns.
- **Decision**: FIXED via Fix A

### F2 — Persist mapping uses 503 and a migration path instead of generic 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/progression-apply.ts:33
- **Detail**: Phase 3 HTTP contract maps persist failures to 500 `"Failed to save progression"`. Implementation maps schema-cache / missing-function to 503 and returns the migration filename in the **client** body. The plan’s Migration Notes already name that PostgREST error; sibling `session-log.ts` never echoes persist internals. Useful for hosted setup, extra surface vs the contract.
- **Fix A ⭐ Recommended**: Keep 503 for schema-cache misses. Return a generic client string (`"Progression is not set up on the database"`). Log the migration filename server-side only. Add a one-line plan addendum that persist may be 503 when the RPC is missing.
  - Strength: Keeps the hosted-ops signal without leaking a repo path; matches sibling error bodies.
  - Tradeoff: Slightly less copy-pasteable for the operator who has not read the plan.
  - Confidence: HIGH — the 503 branch is already isolated.
  - Blind spot: None significant.
- **Fix B**: Document the current 503 + filename as a plan addendum and leave the client message as-is.
  - Strength: Zero code change; the message already unblocked hosted apply.
  - Tradeoff: Client continues to see an internal SQL path; contract stays drifted until the addendum is written.
  - Confidence: HIGH — user already used this message successfully.
  - Blind spot: Whether this body is logged by any client analytics.
- **Decision**: FIXED via Fix A

### F3 — Unplanned extras (Vitest adapter skip, husky test, info banner)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: astro.config.mjs:23
- **Detail**: `@astrojs/cloudflare` 13.5 cannot load under Vitest `resolve.external`, so `astro.config.mjs` skips the adapter when `process.env.VITEST` is set. `.husky/pre-commit` runs `npm test` after lint-staged (user-requested after Phase 1). `ServerError` gained `variant="info"` for the Save vs Accept all banner (user-requested after Phase 3). None of these are in the original Changes Required list. Nothing from “What We’re NOT Doing” leaked in (no audit table, no session-list links, no Playwright, no `default_reps` writes).
- **Fix**: Leave as-is; optionally add a one-line addendum in the plan so a later review does not re-flag them.
- **Decision**: SKIPPED

### F4 — Extra plan-exercise UUID can 404 instead of 400

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260830221000_apply_progression_loads_rpc.sql:59
- **Detail**: An extra `plan_exercise_id` that belongs to this plan but not the session fails set equality (`Invalid loads` → 400). An extra id that is not on this plan fails the earlier `EXISTS` (`Not found` → 404). Same-user oracle for “is this UUID on this plan?”. Cross-user still 404s on the session lock. Same shape as `log_training_session`.
- **Fix**: After the session lock, run set equality first (or map both mismatches to `Invalid loads`) so extras always 400.
- **Decision**: SKIPPED
