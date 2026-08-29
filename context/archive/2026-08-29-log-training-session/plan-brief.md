# Log Training Session — Plan Brief

> Full plan: `context/changes/log-training-session/plan.md`

## What & Why

FR-004 / S-04: let a logged-in user log sets, reps, and loads against a plan they already generated and edited. Without a real session row, S-05 has nothing to suggest from. Under `speed`, this is create + list only — not a logbook editor and not the progression UI.

## Starting Point

F-01 already has `sessions` / `session_sets` (RLS, triggers, UNIQUE set numbers, CASCADE). `/sessions` is a placeholder. Plan detail is the S-03 editor. There is no session API or form.

## Desired End State

The owner opens **Log session** from a plan, sees three prefilled sets per exercise (defaults from the template), can add up to eight, saves only complete sets, and lands on `/sessions` with the new workout at the top.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Product surface | Create + list; no edit/delete | Gym capture is one-shot; history edit balloons S-04 and is not required for S-05 |
| Entry | Log page from plan; list on `/sessions` | PRD logs against a plan; the gated `/sessions` stub already exists |
| Set rows | 3 prefilled, add up to 8 | Typical workout shape; 8 matches the plan exercise cap spirit |
| Incomplete logs | Persist complete sets only; ≥1 required | Roadmap risk: empty/half rows must not poison S-05 |
| Prefill | Plan default reps/load | User logs the template they just edited |
| When | `performed_at = now` | No back-dating in MVP |
| After save | Redirect to `/sessions` | List is the history surface; S-05 is the next slice |
| Persist | Postgres RPC, not session-then-sets | Lesson: non-transactional inserts can leave illegal/empty parents |

## Scope

**In scope:** Transactional POST, log page island, `/sessions` list, Topbar Sessions link, skip-empty + 8-set cap, verification.md.

**Out of scope:** S-05 suggestions, editing past sessions, date picker, CASCADE/RESTRICT change, test runner, device integrations.

## Architecture / Approach

SSR loads the plan (same as detail). A `client:load` island posts JSON to `POST /api/plans/[id]/sessions`. The Worker authenticates and calls `log_training_session`, which locks the plan row and inserts `sessions` + `session_sets` in one transaction. `/sessions` SSR-lists the owner’s sessions newest first.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API + RPC | Atomic log POST | Hosted schema cache missing the function |
| 2. Log UI + list | Form, nav, history | Empty exercise query looking like a blank workout |
| 3. Verification | Repeatable checklist | Attesting without a hosted RPC apply |

**Prerequisites:** S-03 done; F-01 on the DB in `.dev.vars`; at least one plan with 1–8 exercises.  
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Deleting a plan/exercise still CASCADE-deletes this history (S-03 confirm only).
- Skipped exercises store no sets; S-05 must tolerate missing lifts for that session.
- RPC must be applied on hosted Supabase if `.dev.vars` is not local.

## Success Criteria (Summary)

- Owner can save a session with real reps/loads and see it on `/sessions`
- Blank rows never become `session_sets`; stolen plan ids never insert
- Signed-out session routes still redirect to sign-in
