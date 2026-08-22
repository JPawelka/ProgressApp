<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI plan from goal

- **Plan**: context/changes/ai-plan-from-goal/plan.md
- **Scope**: Full plan (Phases 1–4)
- **Date**: 2026-08-22
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING ⚠️ |
| Scope Discipline | WARNING ⚠️ |
| Safety & Quality | WARNING ⚠️ |
| Architecture | PASS ✅ |
| Pattern Consistency | PASS ✅ |
| Success Criteria | PASS ✅ |

## Success criteria verification

| Check | Result |
|-------|--------|
| `npm run lint` | PASS (2026-08-22) |
| `npm run build` | PASS (2026-08-22) |
| Progress manual items (1.6–4.5) | All `[x]` with commit SHAs; user confirmed during implementation |

## Findings

### F1 — Dev mock mode not in original plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/plans/plan-generation-config.ts, verification.md
- **Detail**: `PLAN_GENERATION_MOCK` bypasses OpenRouter when set. Plan assumed missing key → disabled generation; mock treats generation as available and changes config banner text. Already documented in `verification.md` with “never in production” note; not in `plan.md`.
- **Fix**: Add a short addendum to `plan.md` (or `change.md` Notes) documenting mock mode as an intentional dev-only extension.
- **Decision**: FIXED — documented in change.md Notes

### F2 — Mock mode has no production guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/plans/plan-generation-config.ts:4-10
- **Detail**: `isPlanGenerationMockEnabled()` returns true whenever `PLAN_GENERATION_MOCK` is truthy. If accidentally set as a Worker secret in production, users get deterministic mock plans with no OpenRouter call.
- **Fix**: Return `false` when `import.meta.env.PROD` (or equivalent production signal) so mock only works in local dev.
  - Strength: One-line guard; aligns with verification.md “never in production” intent.
  - Tradeoff: None for MVP — mock is dev-only by design.
  - Confidence: HIGH — standard Astro/Cloudflare pattern.
  - Blind spot: None significant.
- **Decision**: FIXED — `import.meta.env.PROD` guard added

### F3 — API returns raw upstream/DB error text

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/plans/openrouter.ts:72-74, src/lib/services/plan-generation.ts:78, src/pages/api/plans/generate.ts:50-55
- **Detail**: `OpenRouterError` embeds up to 200 chars of provider response; `PlanPersistError` forwards Supabase messages. Both are returned to the client as JSON. Can leak billing/auth/schema hints to authenticated users.
- **Fix**: Log full errors server-side; return generic client messages (`"Plan generation failed"`, `"Failed to save plan"`) from the API route.
  - Strength: Matches hardened API boundary pattern; reduces info disclosure.
  - Tradeoff: Slightly harder to debug from browser alone (use server logs).
  - Confidence: HIGH — common production practice.
  - Blind spot: Haven't verified Workers logging setup for local vs prod.
- **Decision**: SKIPPED

### F4 — Persist is two-step; compensating delete unchecked

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/plan-generation.ts:67-97
- **Detail**: Plan insert and exercise inserts are separate calls (no transaction). On exercise failure, `delete()` runs but its result is not checked — a failed cleanup could leave an orphan plan row. Crash between inserts could also leave a plan without exercises.
- **Fix A ⭐ Recommended**: Keep compensating delete for MVP but check delete result and log if cleanup fails; document known limitation in plan/verification.
  - Strength: Minimal diff; improves observability without RPC migration.
  - Tradeoff: Still not fully atomic under crash mid-flight.
  - Confidence: HIGH — matches plan’s “prefer delete over orphans” intent.
  - Blind spot: Crash window between inserts remains until a Postgres RPC lands.
- **Fix B**: Add Supabase RPC wrapping plan + exercises in one transaction.
  - Strength: True atomicity.
  - Tradeoff: New migration + SQL function — scope beyond MVP slice.
  - Confidence: MED — correct long-term, heavier for S-02 close.
  - Blind spot: RLS inside RPC needs careful policy design.
- **Decision**: FIXED via Fix A — delete result checked and logged on cleanup failure

### F5 — No rate limiting on generate endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/plans/generate.ts:17-57
- **Detail**: Any authenticated user can POST repeatedly; each call may hit OpenRouter (45s timeout, paid API). No throttling or deduplication.
- **Fix**: Defer to follow-up (document in plan backlog) or add simple per-user cooldown via KV/DB before S-02 archive if deploying with real OpenRouter soon.
  - Strength: Protects cost and abuse surface.
  - Tradeoff: Extra infra (KV counter or migration) not in current plan.
  - Confidence: MED — important for prod with credits, less urgent with mock-only dev.
  - Blind spot: Haven't checked if Cloudflare Workers rate limits apply at edge.
- **Decision**: FIXED — 5 plans/minute per user via RLS-scoped count before generate

### F6 — AI text fields lack max length

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/plans/plan-generation-schema.ts:6-13
- **Detail**: Exercise and plan `name` have `min(1)` but no `max()`. Model could return very long strings (storage/UI noise).
- **Fix**: Add `.max(100)` on plan name and `.max(80)` on exercise names in Zod + JSON schema.
- **Decision**: FIXED — max lengths added to Zod and JSON schema

### F7 — verification.md checklist table unfilled

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ai-plan-from-goal/verification.md
- **Detail**: Pass/fail table rows are empty templates; Progress marks 4.2–4.5 complete but the doc itself has no Y/N ticks for audit trail.
- **Fix**: Fill checklist with Y and brief notes from the manual runs you performed.
- **Decision**: SKIPPED
