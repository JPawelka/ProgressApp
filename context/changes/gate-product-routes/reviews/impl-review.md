<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Owner-scoped persistence & gated product routes

- **Plan**: context/changes/gate-product-routes/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-11
- **Verdict**: APPROVED
- **Findings**: 0 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria (re-verified)

- Migration + seed present; local DB has 16 RLS policies
- `src/types.ts` exports five symbols; middleware gates `/plans` `/sessions`
- Placeholders + `verification.md` present; checklist all Y
- `npm run lint` passes (2026-08-11 re-run)
- Manual Progress items all `[x]` with SHA suffixes; human confirmed Phase 3

## Findings

### F1 — `numeric` columns typed as `number | null`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/types.ts:19,40
- **Detail**: Plan asked for `number | null` for nullable numerics; PostgREST/Supabase JS commonly returns `numeric` as strings. Types match the plan literally but may lie at the first DB read in S-02+.
- **Fix A ⭐ Recommended**: Change `default_load_kg` / `load_kg` to `string | null` (or branded decimal) before first repository reads
  - Strength: Matches runtime JSON shape; avoids silent NaN bugs later.
  - Tradeoff: Diverges from plan’s “number | null” wording.
  - Confidence: HIGH — common Supabase/PostgREST behavior.
  - Blind spot: Exact client version behavior not re-tested in this review.
- **Fix B**: Keep `number | null`; parse/coerce at a future service boundary
  - Strength: Types stay plan-literal until CRUD lands.
  - Tradeoff: Easy to forget the coerce layer.
  - Confidence: MEDIUM — depends on discipline in S-02+.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A + ACCEPTED-AS-RULE: Supabase numeric → string in entity types

### F2 — Phase 1 commit bundled unrelated `.cursor/*` and roadmap

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: git commit 6fe4a59
- **Detail**: p1 commit intentionally staged prior-lesson `.cursor` skills and `context/foundation/roadmap.md` alongside the migration. Not product scope creep (no CRUD/AI), but the change commit is impure.
- **Fix**: Accept as historical; keep future phase commits to the touched-file set only (already done for p2/p3).
- **Decision**: FIXED — accepted as historical; no code change

### F3 — Exercise CASCADE deletes historical session_sets

- **Severity**: 💭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260811122333_owner_scoped_persistence.sql:45
- **Detail**: `session_sets.plan_exercise_id ON DELETE CASCADE` wipes set history when an exercise row is deleted. Plan explicitly accepted parent→child CASCADE for MVP; still a product footgun once edit-plan ships.
- **Fix**: Defer to S-03; confirm-before-delete or RESTRICT if history must survive template edits.
- **Decision**: FIXED — deferred to S-03; no schema change now
