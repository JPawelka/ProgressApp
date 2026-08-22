# AI plan from goal — Plan Brief

> Full plan: `context/changes/ai-plan-from-goal/plan.md`

## What & Why

FR-002 / S-02: let a logged-in user generate a training plan from a goal (mass / strength / endurance) via AI so the must-have path can move past “empty plans table” into a real first artifact. Under `speed`, one happy path — generate, persist, read-only view — without pulling edit (S-03).

## Starting Point

F-01 already shipped owner-scoped `plans` / `plan_exercises` + types + gated `/plans` placeholder. Auth works. No LLM client, domain API, zod, or plan UI yet. OpenRouter is the infra assumption; key not wired.

## Desired End State

User picks a goal on `/plans`, waits for OpenRouter, lands on read-only `/plans/[id]` with 3–8 exercises persisted under RLS. Failures show a clear error and insert nothing. Multiple plans per user are allowed.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| -------- | ------ | ---------------- |
| Scope vs S-03 | Generate + read-only view | Proves FR-002 without edit-UI balloon |
| Provider | OpenRouter | Matches infrastructure / deploy deferred checklist |
| Post-generate UX | `/plans/[id]` detail | Durable URL for later edit/log slices |
| Multi-plan | Many plans (insert each time) | Matches schema; avoids destructive replace |
| LLM failure | Fail clearly, no partial save | Prevents empty plans poisoning later slices |
| Plan shape | Strict 3–8 exercises + optional defaults | Fits existing columns; safe for S-04 |
| UI↔API | JSON `fetch` island | Fits multi-second LLM latency better than form redirect |
| Verification | Manual happy + failure path | Matches F-01; avoids adding a test runner now |

## Scope

**In scope:** zod + `OPENROUTER_API_KEY`, OpenRouter `fetch` client, generate service, `POST /api/plans/generate`, `/plans` generate+list, read-only `/plans/[id]`, nav link, `verification.md`.

**Out of scope:** Edit/delete (S-03), sessions/progression, test runner, streaming, direct OpenAI/Anthropic SDKs, single-plan replace semantics.

## Architecture / Approach

React island → `POST /api/plans/generate` → OpenRouter structured JSON → zod validate → insert `plans` then `plan_exercises` (rollback plan if children fail) → redirect to detail. Server-only secret; RLS enforces owner on reads/writes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. AI + validation foundation | Env, zod, OpenRouter client, schemas, LLM-only service | Wrong model / schema → invalid JSON at runtime |
| 2. Generate API + persist | Auth JSON API + atomic-enough insert | Partial save if exercise insert fails without cleanup |
| 3. Plans UI | Generate form, list, read-only detail, nav | Latency UX feels broken if pending state skipped |
| 4. Manual verification | `verification.md` + human checklist | Skipping real OpenRouter smoke test |

**Prerequisites:** F-01 migration applied locally; OpenRouter API key in `.dev.vars`; signed-in test user.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- Default OpenRouter model id is chosen at implement time — may need swap if structured outputs are flaky.
- Hosted Supabase must already have F-01 schema before production generate works.
- Production Worker needs `wrangler secret put OPENROUTER_API_KEY` when AI is enabled (still deferred in deploy checklist until this lands).

## Success Criteria (Summary)

- User can generate a plan from each goal and open it read-only
- Failed generation never leaves orphan/empty plans
- Unauthenticated users cannot reach `/plans` or generate
