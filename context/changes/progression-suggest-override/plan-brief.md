# Progression Suggest Override — Plan Brief

> Full plan: `context/changes/progression-suggest-override/plan.md`

## What & Why

After a user logs a session they still do not know whether to increase, hold, or deload. This slice is the north star: show a rule-based suggestion per logged exercise and let them accept or override it so the next workout’s loads are already decided.

## Starting Point

S-04 logs complete sets atomically, then redirects to `/sessions`. Plan `default_load_kg` never changes from logging. There is no progression code. Skipped lifts store zero rows; the rule must omit them.

## Desired End State

Saving a session opens `/sessions/{id}/suggestion` with increase / hold / deload and a prefilled kg per logged exercise. Accept all or Save writes those loads onto plan defaults; Skip leaves defaults alone. The next log prefills the new numbers.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Surface | Post-log screen only | PRD wants the suggestion immediately after logging; list/plan preview can wait |
| Granularity | Per logged exercise | Defaults and history are per exercise; a session-level verdict would hide mixed results |
| Persist | Write `default_load_kg` only; no suggestion table | Next log already prefills from defaults; an audit table is extra scope |
| Rule | Last session vs `default_reps` (+2.5 / hold / −10%) | Simple, bounded, uses the session just logged; no prior-session query |
| Abandon | Leave defaults unchanged | Session is already saved; gym users may skip the extra step |
| Override UX | Edit kg then Save; Accept all = suggested kgs | One form, always overridable, no extra decision control |
| Messy inputs | Omit skipped; null target → hold at heaviest; mixed loads still per-set vs target | Matches S-04 skip-empty and avoids fake precision |
| Tests | Vitest on the pure rule + CI `npm test` | Wrong math burns trust; no runner exists yet |
| Apply path | One RPC, not N exercise PATCHes | PATCH is full-row and not transactional |

## Scope

**In scope:** Pure rule + Vitest/CI, post-log suggestion page, Skip, Save / Accept all via `apply_progression_loads`, redirect after log.

**Out of scope:** Suggestion audit table, session-list reopen, goal-specific formulas, periodization, changing `default_reps`, editing past sessions, API/e2e test harness.

## Architecture / Approach

Log still returns 201 `{ session }`. The form goes to an SSR page that loads that session’s sets + plan exercises, runs `suggestProgression`, and hydrates a `client:load` island. Save POSTs `/api/sessions/{id}/progression`; an invoker RPC locks the session and updates only matching `default_load_kg` values.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Rule + Vitest | Tested function + CI `npm test` | Astro 6 Vitest env / `@/` alias misconfig |
| 2. Suggestion screen | Post-log UI + Skip | Form still ignores `session.id` and lands on `/sessions` |
| 3. Apply loads | Save / Accept all → plan defaults | Hosted schema cache missing the RPC; partial apply if someone uses PATCH |

**Prerequisites:** S-04 on the DB in `.dev.vars`; at least one plan with exercises that have `default_reps`.  
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Visiting an old session’s suggestion URL recomputes against **current** `default_reps` (not linked from the list).
- Backoff sets with fewer reps will block an increase (no backoff awareness).
- Hosted Supabase must receive the Phase 3 migration or apply 404s as a missing function.

## Success Criteria (Summary)

- After log, the owner sees a per-exercise suggestion they can Skip without changing the plan
- Accept / override updates `default_load_kg` and the next log prefills it
- Stolen session ids never leak or write; skipped lifts never get a default write
