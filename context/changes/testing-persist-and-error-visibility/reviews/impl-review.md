<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Persist completeness and error visibility

- **Plan**: context/changes/testing-persist-and-error-visibility/plan.md
- **Scope**: Phase 1–3 of 3
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Generate persist 500 still leaks PostgREST text

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/plan-generation.ts:77, src/pages/api/plans/generate.ts:63-64
- **Detail**: Log/apply mappers return generic 500 copy and log the RPC text. `PlanPersistError` still carries PostgREST `message`, and generate POST returns that string. Phase 2 wired `errorMessageFromBody` on the generate island, so DB constraint text can now show in the UI. The plan did not add a generate failure mapper (no handler suite).
- **Fix A ⭐ Recommended**: Add a generate persist mapper that logs internally and returns a stable `"Failed to generate plan"` (or equivalent) to the client, matching `sessionLogFailure`.
  - Strength: Same pattern as log/apply; stops leaking schema/constraint text.
  - Tradeoff: Slightly less specific UI copy on persist failure.
  - Confidence: HIGH — identical siblings exist.
  - Blind spot: Generate 502 AI errors should stay specific; only persist 500 should be generic.
- **Fix B**: Leave as-is and note in cookbook that generate persist 500 is provider text until a later slice.
  - Strength: No extra code in a closed test-plan phase.
  - Tradeoff: Leak remains user-visible after this change made errors more faithful.
  - Confidence: MEDIUM — was pre-existing on the API; this change increased visibility.
  - Blind spot: Whether any persist message is useful to the owner.
- **Decision**: FIXED via Fix A

### F2 — Generate JSON parse uses outer catch, unlike log

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/plans/GeneratePlanForm.tsx:30-44
- **Detail**: Log wraps success `json()` and uses `"Session saved but the suggestion page could not be opened"` when the body is unreadable. Generate `await response.json()` sits in the outer try; a 200 with non-JSON becomes `"Failed to generate plan"` even if persist already succeeded. Missing `planId` after a parsed body is handled correctly.
- **Fix**: Mirror log: on `ok`, parse JSON in an inner try; on parse failure use `"Plan generated but the plan page could not be opened"`.
- **Decision**: FIXED

### F3 — Generate persist can still orphan a plan on 500

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/lib/services/plan-generation.ts:67-109
- **Detail**: Two-step insert + compensating delete is the planned seam. Tests prove throw + delete attempted, including delete-failure still throwing. An empty plan can remain with HTTP 500. Not a silent 200. A transactional RPC would close it; that was out of scope.
- **Fix**: Keep as a known hole; do not treat 200 as incomplete. Revisit with an RPC if orphans show up in product.
- **Decision**: SKIPPED

### F4 — Fake persist client does not assert `default_load_kg` string format

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/plan-generation.test.ts:35-38
- **Detail**: Lessons require numeric → string at the write boundary (`toFixed(2)`). The fake records `payload` but no test asserts `"100.00"`. Removing `toLoadKg` would still pass.
- **Fix**: Assert one exercise row’s `default_load_kg` is `"100.00"` on the happy-path insert.
- **Decision**: SKIPPED
