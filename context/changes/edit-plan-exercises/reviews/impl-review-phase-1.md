<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit Plan & Exercises

- **Plan**: context/changes/edit-plan-exercises/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria verification

| Check | Result |
|-------|--------|
| `npm run lint` | PASS (2026-08-29; pre-existing `no-console` warning in `plan-generation.ts` only) |
| `npm run build` | PASS (2026-08-29) |
| Progress 1.1–1.4 | `[x]` — 028d700 |
| Progress 1.5–1.10 | `[x]` — 028d700; human confirmed in this session (including cross-user 404) |

## Findings

### F1 — Cardinality check is racy (plan can go to 0 or 9)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/plan-edit.ts:139-142, 223-226
- **Detail**: Count-then-insert/delete is not atomic. Two concurrent DELETEs of different rows at count=2 can both pass `count > 1` and leave 0 exercises. Two concurrent POSTs at count=7 can yield 9. Same-id last-exercise delete is fine (both 409). Plan invariant: “Failures do not leave the plan in an illegal count.” MVP sequential UI is unlikely to hit this; S-04 still needs a legal template.
- **Fix A ⭐ Recommended**: Document as known MVP limitation in the plan; keep count-then-mutate until logging exists
  - Strength: Matches `speed`; race needs two tabs on the same plan.
  - Tradeoff: Illegal counts remain possible under concurrency.
  - Confidence: HIGH — sequential console tests already passed 1–8.
  - Blind spot: No automated concurrency test.
- **Fix B**: Postgres RPC with `SELECT … FOR UPDATE` on the plan row, then count + mutate
  - Strength: True 1–8 under concurrency.
  - Tradeoff: New migration + RPC; heavier than this slice.
  - Confidence: MED — RLS inside RPC needs care.
  - Blind spot: Hosted migration apply path.
- **Decision**: FIXED via Fix A (plan note) + ACCEPTED-AS-RULE: Count-then-mutate is not a cardinality invariant + code Fix B (RPC `SELECT … FOR UPDATE`)

### F2 — Persist errors leak database messages to the client

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/plan-edit.ts:84-86
- **Detail**: `planEditFailure` returns `PlanEditPersistError.message` (PostgREST/Postgres text, trigger names) as JSON `error` on 500. Same pattern as generate (`PlanPersistError`). 404/409 copy is fine.
- **Fix A ⭐ Recommended**: Generic client message (`"Failed to save plan"`); log the real error server-side
  - Strength: Shrinks info disclosure on four new endpoints.
  - Tradeoff: Harder to debug from the browser (use server logs).
  - Confidence: HIGH — generate impl-review F3 flagged the same class (skipped there).
  - Blind spot: Workers log visibility in local vs prod.
- **Fix B**: Keep leaking, same as generate, until both APIs are hardened together
  - Strength: Consistent DX with generate; no extra work now.
  - Tradeoff: More authenticated leak surface.
  - Confidence: MED — matches existing generate choice.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F3 — Unplanned shared `plan-api.ts` helper

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/plans/plan-api.ts
- **Detail**: Plan asked routes to copy generate’s `json` + `getUser()` inline. Implementation extracted `json`, `parseJsonBody`, `requirePlanApiAuth`. Generate.ts was not refactored. Behavior matches the contract.
- **Fix**: Document as an addendum in the plan (keep the helper).
- **Decision**: SKIPPED
