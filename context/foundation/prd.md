---
project: ProgressApp
version: 1
status: draft
created: 2026-07-25
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-09-13
  after_hours_only: true
---

# ProgressApp

## Vision & Problem Statement

Beginners and intermediate self-directed lifters feel decision paralysis when planning the next session: they don't know whether to increase the load, hold it, or deload. Manual progression planning needs experience and regular calculation they don't have, which leads to stagnation or overtraining.

Logging apps already capture sets and reps but leave the "what next?" decision to the user. ProgressApp's insight is to close that gap — rule-based progression suggestions (increase / hold / deload) grounded in the user's own session history, not another blank logbook.

## User & Persona

**Primary persona:** Self-directed lifter — beginner to intermediate, trains without a coach, uses apps or notes to track workouts. Reaches for the product at the moment of deciding the next session's loads, after logging (or about to log) recent sets.

## Success Criteria

### Primary
- A logged-in user can generate a training plan from a goal (mass / strength / endurance), edit the plan and exercises, log a training session, and receive a progression suggestion for the next session (increase / hold / deload) that they can accept or adjust.

### Secondary
- ~70% of progression suggestions are accepted by the user without manual correction.

### Guardrails
- Session and training-history data stay private to the account owner.
- The user can always manually override any progression suggestion.
- Suggestions stay within clear rule-based bounds (no unexplained large load jumps).

## User Stories

### US-01: First progression loop

- **Given** a logged-in user with a goal-generated plan
- **When** they log a training session
- **Then** they see a progression suggestion (increase / hold / deload) they can accept or override

#### Acceptance Criteria
- Suggestion is based on the user's session history for the relevant exercises
- Manual override of any suggestion is always available

## Functional Requirements

### Authentication
- FR-001: User can create an account and sign in. Priority: must-have
  > Socrates: Counter-argument considered: "Guest mode would prove value faster." Resolution: kept; accounts are required to store plans and history per Access Control.

### Plans
- FR-002: User can generate a training plan from a goal (mass / strength / endurance) via AI. Priority: must-have
  > Socrates: Counter-argument considered: "Goal → AI couples you to an external dependency before any value." Resolution: kept; AI plan generation stays in MVP flow.

- FR-003: User can view and edit their plans and exercises. Priority: must-have
  > Socrates: Counter-argument considered: "Full edit UI balloons scope; view-only + regenerate is enough." Resolution: kept; edit remains must-have.

### Sessions & progression
- FR-004: User can log a training session (sets / reps / loads). Priority: must-have
  > Socrates: Counter-argument considered: "Incomplete logs will poison progression suggestions." Resolution: kept; treat incomplete-log quality as a risk to manage, not a reason to drop logging.

- FR-005: User can receive an automatic progression suggestion for the next session (increase / hold / deload) based on session history. Priority: must-have
  > Socrates: Counter-argument considered: "Wrong suggestions erode trust faster than no suggestions." Resolution: kept; mitigated by rule-based bounds guardrail.

- FR-006: User can accept or manually override a progression suggestion. Priority: must-have
  > Socrates: Counter-argument considered: "Accept/override UX adds a step users skip in the gym." Resolution: kept; override remains a hard guardrail.

## Non-Functional Requirements

- Session and training-history data remain visible only to the account owner.
- # TODO: Additional NFRs (perceived latency, browser support, etc.) — see Open Questions

## Business Logic

From recent set history, decide increase / hold / deload for the next session.

The rule consumes completed sets with load and reps from the session just logged. Its output is a decision for the next session — increase, hold, or deload — together with a suggested load. The user encounters this immediately after logging a workout.

## Access Control

Login required (account creation + sign-in). Flat user model — every account is the same; no admin/member/guest roles. Each user can access only their own plans and session history. Unauthenticated users cannot reach gated plan/session routes.

## Non-Goals

- No own advanced periodization algorithm (blocks / mesocycles) — out of MVP; keep progression rules simple.
- No multi-format plan import (PDF, DOCX, etc.) — generation + edit only.
- No sharing plans between users — single-user accounts only.
- No device integrations — manual session logging only.
- No mobile apps — web only for MVP.

## Open Questions

1. **Additional NFRs** — none beyond privacy from Guardrails; confirm if perceived latency / browser support matter for MVP. Owner: user.
