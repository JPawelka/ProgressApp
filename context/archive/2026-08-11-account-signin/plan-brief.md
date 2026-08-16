# Account sign-in (FR-001) — Plan Brief

> Full plan: `context/changes/account-signin/plan.md`

## What & Why

FR-001 requires that a user can create an account and sign in. Auth already exists in the starter; S-01 is a confirm-and-close gate so the roadmap can treat account access as covered without rebuilding auth or adding profiles/roles.

## Starting Point

Supabase SSR cookie sessions, sign-up/sign-in/sign-out/confirm-email pages and APIs, and middleware-gated product routes are already in the repo. Prior deployment smokes were partial; there is no S-01 verification checklist yet.

## Desired End State

A filled local `verification.md` proves sign-up → sign-in → protected route access (and anonymous redirect). Minimal code fixes only if that smoke fails. Production Worker login and email-confirm callbacks stay follow-ups.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| -------- | ------ | ---------------- |
| Scope | Confirm-and-close + thin verification.md | Matches roadmap “do not re-scaffold / no profile-roles” under `speed` |
| Email confirm | Local confirmations-off path | Verifiable without callback wiring |
| Verify where | Local only | Keeps the gate clear; Worker login remains deployment follow-up |
| Success bar | Checklist all Y | Auditable like F-01 |
| On blocker | Fix minimal in-slice, re-verify | Honest FR-001 without polish creep |

## Scope

**In scope:** `verification.md`, local smoke, minimal blocker fixes only if needed.

**Out of scope:** Email callback / production confirm-on, Worker full-login smoke, redirect redesign, zod, OAuth, profiles/roles, automated e2e.

## Architecture / Approach

No new auth architecture. Reuse existing pages/APIs/middleware. Document and prove the local happy path; touch code only to restore that path.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Verification contract | Clear FR-001 checklist | Vague steps → inconsistent human runs |
| 2. Local smoke & close | Proven local sign-up/sign-in | “Minimal blocker” interpreted as polish |

**Prerequisites:** Local Supabase + `npm run dev` + configured env.
**Estimated effort:** ~1 short session across 2 phases.

## Open Risks & Assumptions

- Local `enable_confirmations = false` remains true (or equivalent Studio-confirmed user).
- Production email-confirm / Worker Site URL issues stay outside this change (known from deployment plan).
- “Minimal blocker” excludes polish listed in plan out-of-scope.

## Success Criteria (Summary)

- Local user can sign up and sign in
- Signed-in user reaches a protected page; anonymous user is redirected to sign-in
- Checklist in `verification.md` is fully Y
