# Verification: log-training-session (S-04 / FR-004)

Repeatable smoke for logging a training session (sets / reps / loads) against an existing plan. Fill the checklist at the bottom when running Phase 3.

**Scope:** Create session from `/plans/[id]/log`, list on `/sessions`, `POST /api/plans/[id]/sessions`. No edit/delete of past sessions. Progression is out of scope (S-05).

## Prerequisites

1. Supabase reachable with F-01 schema **and** the log RPC applied:
   - Tables + RLS: `sessions`, `session_sets` (`supabase/migrations/20260811122333_owner_scoped_persistence.sql`)
   - Function: `log_training_session` (`supabase/migrations/20260829121500_log_training_session_rpc.sql`)
   - **The database in `.dev.vars` `SUPABASE_URL` is the one that matters.** If that URL is `*.supabase.co`, apply SQL on the **hosted** project (Dashboard → SQL Editor). Local Studio at `127.0.0.1:54323` does not change hosted data.
2. Env: `SUPABASE_URL` + `SUPABASE_KEY` in `.dev.vars` (see `.env.example`)
3. App running: `npm run dev`
4. Signed-in test user with **at least one plan** that has **1–8 exercises**
5. Optional for isolation: a **second account**

**If POST returns** `Could not find the function public.log_training_session`: run the log RPC SQL on that project, then retry.

---

## 1. Happy path — log from a plan

While signed in as the plan owner:

1. Open `/plans` → open a plan → **Log session** → `/plans/{planId}/log`
2. Confirm each exercise has **3** prefilled set rows (plan defaults)
3. Change at least one set (or leave defaults) → **Save session**
4. Expect: redirect to `/sessions`; new row at the **top** with plan name and a time close to now

Optional Studio: `sessions.performed_at` is within a minute of save time.

---

## 2. Skip empty and 8-set cap

1. **Add set** on one exercise until 8; expect add unavailable and “already has 8 sets”
2. Fill **one** complete set; clear the other rows on that exercise; leave another exercise fully blank → save
3. In `session_sets` for that session: only complete sets; **no** null reps/load from blank rows; the skipped exercise has **zero** rows
4. Prefill that you did not clear still counts as complete (defaults are values, not empty)

---

## 3. Auth

While **signed out**:

1. Open `/sessions` → redirect to `/auth/signin`
2. Open `/plans/{any-uuid}/log` → redirect to `/auth/signin`
3. POST without cookies — expect **401**:

   ```js
   fetch(`/api/plans/${PLAN_ID}/sessions`, {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({
       sets: [{ plan_exercise_id: EXERCISE_ID, set_number: 1, reps: 5, load_kg: 100 }],
     }),
   }).then(async (r) => console.log(r.status, await r.json()));
   ```

---

## 4. Isolation (cross-user)

As **user B**, using user A’s `PLAN_ID`:

```js
fetch(`/api/plans/${PLAN_ID}/sessions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sets: [{ plan_exercise_id: "00000000-0000-4000-8000-000000000001", set_number: 1, reps: 5, load_kg: 100 }],
  }),
}).then(async (r) => console.log(r.status, await r.json()));
```

Expect **404**; A’s `sessions` count unchanged.

---

## 5. Error stays on the log page

On `/plans/{id}/log`, clear every set → **Save session**. Expect an in-island error and **no** navigation to `/sessions`.

---

## Pass / fail checklist

| # | Check | Pass? (Y/N) | Notes |
|---|--------|-------------|-------|
| 3.2 | Happy path: log from plan → `/sessions` newest first | Y | Phase 2 (2.4) |
| 3.3 | Skip-empty (no null rows); 3 prefilled; add blocked at 8 | Y | Phase 2 (2.5–2.6) |
| 3.4a | Signed-out `/sessions` and log URL → sign-in; unauthenticated POST → 401 | Y | Phase 2 (2.7) + Phase 1 (1.8) |
| 3.4b | Other user POST → 404, no rows | Y | Phase 1 (1.9) |
| — | Failed save stays on the log page | Y | Phase 2 (2.8) |

**Phase 3 / FR-004 complete only when all rows are Y.**

### Notes (environment quirks)

- Document port, Supabase target (local vs hosted), and whether `log_training_session` was applied via migration or pasted SQL.
- `default_load_kg` may arrive as a number in the island; the form stringifies before save.
- Session + sets insert is RPC-backed; plan/exercise DELETE still CASCADE-wipes this history.
