# Owner-scoped persistence & gated product routes — Plan Brief

> Full plan: `context/changes/gate-product-routes/plan.md`

## What & Why

ProgressApp needs a minimal owner-scoped persistence contract for plans and session history before S-02–S-05 invent storage ad hoc. This change lands the schema + RLS, shared types, and gated `/plans`/`/sessions` stubs so privacy and Access Control are enforceable and testable.

## Starting Point

Auth SSR and `/dashboard` gating work; the DB is `auth.users` only — no migrations, domain types, or product routes. Repo rules already require RLS and dated SQL migrations.

## Desired End State

Four owner-scoped tables with per-operation RLS; `src/types.ts` mirrors them; unauthenticated users hitting `/plans` or `/sessions` go to sign-in; signed-in users see thin placeholders; documented two-user checks prove cross-user denial.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| -------- | ------ | ---------------- |
| Scope | Schema + RLS + types + stub protected prefixes | Unlocks later slices and verifies privacy/gates without domain CRUD |
| Schema depth | `plans`, `plan_exercises`, `sessions`, `session_sets` | Matches PRD entities; keeps progression/AI out of F-01 |
| Route gating | Extend `PROTECTED_ROUTES` with `/plans`, `/sessions` | Access Control testable before real pages land |
| Ownership | `user_id` + `auth.uid()` on every table | Standard Supabase pattern; simple indexed policies |
| App surface | Types only (no services / gen types) | Typed contract without premature repositories |
| Placeholders | Thin Astro shells | Makes gate redirects manually verifiable |
| Deletes | `ON DELETE CASCADE` user + parent→child | No orphans; fits single-owner non-sharing MVP |
| RLS proof | Manual Studio/SQL + `verification.md` | Fits repo with no test runner yet |

## Scope

**In scope:** Migration + RLS + triggers, empty `seed.sql`, `src/types.ts`, middleware prefixes, `/plans` & `/sessions` placeholders, README correction, verification doc.

**Out of scope:** Domain APIs/services, AI generation, progression storage, soft deletes, sharing, automated policy tests, renaming folder to `owner-scoped-persistence`.

## Architecture / Approach

Postgres tables keyed by `user_id` → `auth.users`; children carry denormalized `user_id` + consistency triggers; anon SSR client relies on RLS. Astro middleware continues prefix gating; placeholders mirror `dashboard.astro`. Behavior columns and insert paths stay in S-02–S-05.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Owner-scoped schema & RLS | Migration, policies, triggers, seed file | Child insert with stolen parent FK if triggers skipped |
| 2. Types & gated product stubs | Types, middleware, placeholders, README | Forgetting build/lint with real env |
| 3. Ownership verification | Documented two-user + route checks | Human skips cross-user denial proof |

**Prerequisites:** Local Supabase (Docker) for migrate/reset; two test users for Phase 3.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Roadmap Change ID is `owner-scoped-persistence`; this folder is `gate-product-routes` — roadmap status sync will not auto-flip F-01.
- Hosted Supabase may still lack this schema until someone runs `db push` / linked migrate after local proof.
- Deleting a plan cascades sessions/sets — acceptable for MVP; product may later want “history survives plan delete.”

## Success Criteria (Summary)

- Owner-only access enforced at the DB for plans and session history
- Unauthenticated users cannot open `/plans` or `/sessions`
- Later slices have typed tables to build on without redesigning ownership
