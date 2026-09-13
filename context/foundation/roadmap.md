---
project: ProgressApp
version: 1
status: draft
created: 2026-08-10
updated: 2026-08-30
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: ProgressApp

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Self-directed lifters get stuck deciding whether to increase, hold, or deload — logs capture sets but not the next decision. ProgressApp closes that gap with rule-based progression suggestions grounded in the user's own session history. The core hypothesis — the claim that must be true for the product to matter — is that a suggestion (increase / hold / deload) shown right after logging is more useful than another blank logbook.

## North star

**S-05: user can receive a progression suggestion and accept or override it** — this is the validation milestone for the primary Success Criterion and the earliest place the full must-have path (the strict FR set required to launch) proves the core hypothesis.

> North star here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | owner-scoped-persistence | (foundation) owner-scoped persistence contract for plans and session history | — | Access Control, Guardrails privacy | done |
| S-01 | account-signin | create an account and sign in | — | FR-001 | done |
| S-02 | ai-plan-from-goal | generate a training plan from a goal (mass / strength / endurance) | F-01, S-01 | FR-002 | done |
| S-03 | edit-plan-exercises | view and edit their plans and exercises | S-02 | FR-003 | done |
| S-04 | log-training-session | log a training session (sets / reps / loads) | S-03 | FR-004 | done |
| S-05 | progression-suggest-override | receive a progression suggestion and accept or override it | S-04 | US-01, FR-005, FR-006 | done |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Account access | `S-01` | Parallel with Stream B head; auth already in baseline — confirm then move on. |
| B | Progression loop | `F-01` → `S-02` → `S-03` → `S-04` → `S-05` | Must-have path to the north star under `speed`. |

## Baseline

What's already in place in the codebase as of `2026-08-10` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — UI framework, routing, and component library wired (`astro.config.mjs`, `src/pages/`)
- **Backend / API:** present — server-rendered API routes and middleware; domain APIs beyond auth not yet present (`src/pages/api/auth/*`, `src/middleware.ts`)
- **Data:** partial — auth client wired; app schema/migrations and table queries absent (`supabase/config.toml`, no `migrations/`)
- **Auth:** present — provider SSR sessions and route gate (`src/lib/supabase.ts`, `src/middleware.ts`)
- **Deploy / infra:** partial — Worker config + CI lint/build; production deploy path documented outside app code (`wrangler.jsonc`, `.github/workflows/ci.yml`)
- **Observability:** partial — platform Worker observability flag only; no app-level error tracking

## Foundations

### F-01: Owner-scoped persistence

- **Outcome:** (foundation) owner-scoped persistence contract for plans and session history lands with per-owner access rules.
- **Change ID:** owner-scoped-persistence (delivered as `gate-product-routes`)
- **PRD refs:** Access Control, Success Criteria Guardrails (privacy)
- **Unlocks:** S-02, S-03, S-04, S-05
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Without a minimal persistence contract, every domain slice invents storage ad hoc and privacy guardrails cannot be verified; scoped narrowly so plan/session/progression behavior still lands in the vertical slices.
- **Status:** done

## Slices

### S-01: Account sign-in

- **Outcome:** user can create an account and sign in
- **Change ID:** account-signin
- **PRD refs:** FR-001
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Auth is already present in baseline — this slice is a confirm-and-close gate so FR-001 stays covered without re-scaffolding; do not expand into profile or roles work.
- **Status:** done

### S-02: AI plan from goal

- **Outcome:** user can generate a training plan from a goal (mass / strength / endurance)
- **Change ID:** ai-plan-from-goal
- **PRD refs:** FR-002
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Which LLM provider/API keys are used for plan generation in this MVP? — Owner: user. Block: no. → Resolved: Gemini (`GEMINI_API_KEY`, `gemini-2.5-flash`).
- **Risk:** External AI dependency sits on the must-have path; under `speed`, keep generation to one goal→plan happy path and defer polish.
- **Status:** done

### S-03: Edit plan and exercises

- **Outcome:** user can view and edit their plans and exercises
- **Change ID:** edit-plan-exercises
- **PRD refs:** FR-003
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Edit UI can balloon scope; under `speed`, cover only what is needed so the logged session and progression still reflect the user's plan.
- **Status:** done

### S-04: Log training session

- **Outcome:** user can log a training session (sets / reps / loads)
- **Change ID:** log-training-session
- **PRD refs:** FR-004
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Incomplete logs can poison progression; capture enough structured set data for the rule, not a full workout social feed.
- **Status:** done

### S-05: Progression suggest and override

- **Outcome:** user can receive a progression suggestion and accept or override it
- **Change ID:** progression-suggest-override
- **PRD refs:** US-01, FR-005, FR-006
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wrong suggestions erode trust faster than no suggestions — keep the rule within clear increase/hold/deload bounds and always expose override; this is the north star, so ship it as soon as S-04 lands.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | owner-scoped-persistence | Owner-scoped persistence for plans and sessions | yes | Unlocks the north-star chain; run first |
| S-01 | account-signin | Confirm account create and sign-in | yes | Parallel with F-01; likely already satisfied by baseline |
| S-02 | ai-plan-from-goal | Generate training plan from goal via AI | no | Needs F-01 + S-01 |
| S-03 | edit-plan-exercises | View and edit plans and exercises | no | Needs S-02 |
| S-04 | log-training-session | Log training session sets/reps/loads | no | Needs S-03 |
| S-05 | progression-suggest-override | Progression suggestion with accept/override | no | North star; needs S-04 |

## Open Roadmap Questions

1. **Additional NFRs** — none beyond privacy from Guardrails; confirm if perceived latency / browser support matter for MVP. — Owner: user. Block: roadmap-wide (does not gate a specific slice today).

## Parked

- **Own advanced periodization (blocks / mesocycles)** — Why parked: PRD §Non-Goals; keep progression rules simple.
- **Multi-format plan import (PDF, DOCX, etc.)** — Why parked: PRD §Non-Goals; generation + edit only.
- **Sharing plans between users** — Why parked: PRD §Non-Goals; single-user accounts only.
- **Device integrations** — Why parked: PRD §Non-Goals; manual session logging only.
- **Mobile apps** — Why parked: PRD §Non-Goals; web only for MVP.
- **App-level observability beyond platform defaults** — Why parked: Open Question on additional NFRs unresolved; `speed` keeps instrumentation out of the must-have path.

## Done

- **S-05: user can receive a progression suggestion and accept or override it** — Archived 2026-08-30 → `context/archive/2026-08-29-progression-suggest-override/`. Lesson: —.
- **S-04: user can log a training session (sets / reps / loads)** — Archived 2026-08-29 → `context/archive/2026-08-29-log-training-session/`. Lesson: —.
- **S-03: user can view and edit their plans and exercises** — Archived 2026-08-29 → `context/archive/2026-08-22-edit-plan-exercises/`. Lesson: —.
- **S-02: user can generate a training plan from a goal (mass / strength / endurance)** — Archived 2026-08-22 → `context/archive/2026-08-16-ai-plan-from-goal/`. Lesson: —.
- **S-01: user can create an account and sign in** — Archived 2026-08-16 → `context/archive/2026-08-11-account-signin/`. Lesson: —.
- **F-01: (foundation) owner-scoped persistence contract for plans and session history** — Completed 2026-08-11 via `context/changes/gate-product-routes/` (roadmap Change ID was `owner-scoped-persistence`). Lesson: —.
