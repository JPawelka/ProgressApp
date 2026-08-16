# Account sign-in (FR-001) — Implementation Plan

## Overview

Confirm FR-001 for ProgressApp: a user can create an account and sign in. Auth already ships in the Astro + Supabase starter; this change is a confirm-and-close gate with a thin local verification checklist — not a re-scaffold of auth, profiles, or roles.

## Current State Analysis

- Sign-up, sign-in, sign-out, and confirm-email surfaces exist (`src/pages/auth/*`, `src/pages/api/auth/*`) with cookie SSR via `@supabase/ssr` (`src/lib/supabase.ts`).
- Middleware resolves `locals.user` and gates `/dashboard`, `/plans`, `/sessions` (`src/middleware.ts`).
- Local Supabase defaults `enable_confirmations = false` (`supabase/config.toml`); README documents turning confirmation off for hosted projects during local-style smoke.
- Prior deployment smokes covered page loads and redirects; no formal S-01 verification checklist exists yet.
- Roadmap S-01 risk: confirm without expanding into profile/roles; Stream A says “auth already in baseline — confirm then move on.”

## Desired End State

- `context/changes/account-signin/verification.md` documents a repeatable local FR-001 smoke (prerequisites + pass/fail checklist).
- Local happy path proven: sign up → sign in → access a protected route as that user; anonymous visit to a protected route still redirects to `/auth/signin`.
- If smoke hits a minimal blocker (env, broken redirect, obvious API bug), it is fixed in-slice and re-verified.
- FR-001 is considered covered for roadmap purposes; production Worker login and email-confirm callback remain out of scope (noted as follow-ups).

### Key Discoveries:

- Hybrid forms: React islands for sign-in/up; Astro POST forms for sign-out — keep as-is for this gate.
- Post-login redirect targets `/` today (`signin.ts`); success for S-01 is “session works and protected routes accept the user,” not a redirect redesign.
- No auth callback route for email links — acceptable under local confirmations-off decision.

## What We're NOT Doing

- Re-scaffolding auth UI or replacing Supabase Auth
- Email confirmation callback / `emailRedirectTo` / production confirm-on flow
- Production Worker full-login smoke (stays deployment follow-up)
- Post-login redirect redesign, return-URL after bounce, signed-in redirect off auth pages
- Zod on auth APIs, profile pages, roles, OAuth, password reset polish
- Automated e2e / Playwright for auth

## Implementation Approach

Two short phases: (1) write the verification contract mirroring the F-01 checklist style; (2) run it locally and close — with a narrow allowance to fix only blockers that prevent the documented happy path.

## Phase 1: Verification contract

### Overview

Add a thin, fillable verification doc so FR-001 can be re-run after future auth/env changes.

### Changes Required:

#### 1. Verification notes

**File**: `context/changes/account-signin/verification.md` (create)

**Intent**: Capture prerequisites and a pass/fail checklist for local account create + sign-in + protected access.

**Contract**: Include:
1. Prerequisites — `npx supabase start`, env (`.env` / `.dev.vars` with local `SUPABASE_URL` + anon key), `npm run dev`, email confirmations off (local default or documented toggle)
2. Steps — sign up via `/auth/signup` → land on confirm-email or equivalent; sign in via `/auth/signin`; open `/dashboard` (or `/plans`) while signed in and see authenticated shell; sign out; anonymous `/dashboard` redirects to `/auth/signin`
3. Pass/fail checklist the human fills (Y/N + notes)
4. Explicit note: production Worker login and email-link confirm are out of scope for this change

### Success Criteria:

#### Automated Verification:

- `context/changes/account-signin/verification.md` exists with prerequisites, steps, and a pass/fail checklist covering sign-up, sign-in, protected access, and anonymous redirect

#### Manual Verification:

- Human confirms the checklist items are clear enough to execute without guessing (no need to run smoke yet)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Local smoke & close

### Overview

Execute the checklist against local Supabase + `npm run dev`. Fix only minimal blockers that break the happy path; re-run until all checklist rows are Y.

### Changes Required:

#### 1. Run and record smoke results

**File**: `context/changes/account-signin/verification.md` (update checklist)

**Intent**: Prove FR-001 locally and leave an auditable pass record.

**Contract**: Fill every checklist row Y. Optional Notes line for environment quirks.

#### 2. Minimal blocker fixes (conditional)

**Files**: only auth paths required to restore the happy path (e.g. `src/pages/api/auth/*`, env docs) — if and only if smoke fails

**Intent**: Unblock local sign-up/sign-in/protected access without expanding into polish listed in “What We're NOT Doing.”

**Contract**: Change the smallest surface that restores checklist Y; do not add callback routes, zod, or redirect redesign unless that is the proven blocker.

### Success Criteria:

#### Automated Verification:

- If code was touched, `npm run lint` passes; skip if verification-only

#### Manual Verification:

- Checklist: sign-up completes (confirm-email page or immediate session under confirmations-off)
- Checklist: sign-in succeeds for that user
- Checklist: signed-in user can open `/dashboard` or `/plans`
- Checklist: signed-out / anonymous `/dashboard` redirects to `/auth/signin`
- All checklist rows marked Y in `verification.md`

**Implementation Note**: This phase is primarily human verification. Do not mark the change complete until the checklist in `verification.md` is satisfied. If a minimal code fix lands, re-run the full checklist before closing.

---

## Testing Strategy

### Unit Tests:

- None — confirm-and-close; no new unit test runner work.

### Integration Tests:

- None automated. FR-001 proven via `verification.md` manual steps.

### Manual Testing Steps:

1. `npx supabase start` (confirmations off) and configure `.env` / `.dev.vars`
2. `npm run dev`
3. Execute every step in `verification.md`
4. If fail: fix minimal blocker → restart from step 3
5. Mark all checklist rows Y

## Performance Considerations

N/A for this confirm-and-close gate.

## Migration Notes

No database migrations. Auth uses existing `auth.users`. Hosted email-confirm and Worker Site URL allow-lists remain outside this change.

## References

- Roadmap S-01: `context/foundation/roadmap.md`
- PRD FR-001 + Access Control: `context/foundation/prd.md`
- Auth surfaces: `src/pages/auth/*`, `src/pages/api/auth/*`, `src/middleware.ts`, `src/lib/supabase.ts`
- Prior smoke notes: `context/changes/deployment/deployment-plan.md`
- Checklist style reference: `context/archive/2026-08-11-gate-product-routes/verification.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Verification contract

#### Automated

- [x] 1.1 `verification.md` exists with prerequisites, steps, and FR-001 pass/fail checklist — dd961ec

#### Manual

- [x] 1.2 Checklist steps are clear enough to execute without guessing — dd961ec

### Phase 2: Local smoke & close

#### Automated

- [x] 2.1 If code was touched, `npm run lint` passes (skip if verification-only)

#### Manual

- [x] 2.2 Sign-up completes under local confirmations-off
- [x] 2.3 Sign-in succeeds for that user
- [x] 2.4 Signed-in access to `/dashboard` or `/plans` works
- [x] 2.5 Anonymous `/dashboard` redirects to `/auth/signin`
- [x] 2.6 All checklist rows marked Y in `verification.md`
