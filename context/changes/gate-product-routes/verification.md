# Verification: gate-product-routes (F-01)

Repeatable manual checks for owner-scoped RLS and gated product routes.
Fill the checklist at the bottom when running Phase 3.

## Prerequisites

1. Local Supabase running: `npx supabase start`
2. Migrations applied: `npx supabase db reset` (or migrate) exits 0
3. App running if testing routes: `npm run dev`
4. Two authenticated users (User A and User B), e.g.:
   - Create via Studio **Authentication → Users**, or sign up through `/auth/signup`
   - Both must be confirmed / able to sign in (disable email confirm locally if needed)

Studio: http://127.0.0.1:54323  
API: http://127.0.0.1:54321  

Use the **anon** key with each user’s JWT (or Studio SQL as that user via `set request.jwt.claim.sub`). Service role bypasses RLS — do **not** use it for denial checks.

### Option A — REST with user JWTs

1. Sign in as User A / B (app or Auth API) and copy each `access_token`.
2. Call PostgREST with:
   - `apikey: <ANON_KEY>`
   - `Authorization: Bearer <USER_ACCESS_TOKEN>`

### Option B — SQL Editor as a specific user

In Studio SQL Editor (run as postgres, then set JWT claims for the role):

```sql
-- Replace with User A's uuid from auth.users
select set_config('request.jwt.claim.sub', '<USER_A_UUID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
```

Repeat with User B’s uuid for denial steps. Reset with `reset role;` between users if needed.

---

## 1. Two-user RLS checks

### 1a. As User A — insert lineage

Insert a plan, a plan exercise, a session on that plan, and a session set linking that session + exercise.

Example (SQL, after setting JWT to User A):

```sql
insert into public.plans (user_id, goal, name)
values (auth.uid(), 'strength', 'A plan')
returning id;
-- save :plan_id

insert into public.plan_exercises (user_id, plan_id, name, sort_order)
values (auth.uid(), :plan_id, 'Squat', 0)
returning id;
-- save :exercise_id

insert into public.sessions (user_id, plan_id)
values (auth.uid(), :plan_id)
returning id;
-- save :session_id

insert into public.session_sets (user_id, session_id, plan_exercise_id, set_number, reps, load_kg)
values (auth.uid(), :session_id, :exercise_id, 1, 5, 100)
returning id;
```

Expect: all inserts succeed.

### 1b. As User B — SELECT User A’s plan

```sql
select * from public.plans where id = :plan_id;
```

Expect: **no rows** (or empty result). Do not see User A’s plan.

Also try:

```sql
select * from public.plan_exercises where plan_id = :plan_id;
select * from public.sessions where plan_id = :plan_id;
select * from public.session_sets where session_id = :session_id;
```

Expect: empty for all.

### 1c. As User B — INSERT into User A’s lineage

Attempt inserts that pass RLS `user_id = auth.uid()` but steal User A’s parent FK:

```sql
-- Stolen plan_id
insert into public.plan_exercises (user_id, plan_id, name)
values (auth.uid(), :plan_id, 'Hijack');

-- Stolen plan_id on sessions
insert into public.sessions (user_id, plan_id)
values (auth.uid(), :plan_id);

-- Stolen session_id / plan_exercise_id (if B somehow has own rows, use A's ids)
insert into public.session_sets (user_id, session_id, plan_exercise_id, set_number)
values (auth.uid(), :session_id, :exercise_id, 99);
```

Expect: **fail** — policy error and/or trigger exception (`user_id must match parent…` / plan mismatch / parent not found under RLS).

### 1d. Same-owner cross-plan set (optional integrity check)

As User A, create a second plan + exercise, then try a `session_sets` row whose session is on plan 1 but `plan_exercise_id` is from plan 2.

Expect: trigger rejects (`plan_exercise must belong to the same plan as the session`).

---

## 2. Route-gate checks

With `npm run dev`:

1. **Anonymous:** open `/plans` and `/sessions` → redirect to `/auth/signin`
2. **Signed in:** open `/plans` and `/sessions` → placeholder shell (email visible, no domain CRUD)

---

## Pass / fail checklist

| # | Check | Pass? (Y/N) | Notes |
|---|--------|-------------|-------|
| 3.2 | Cross-user SELECT of another user’s plan returns no rows | Y | Empty under User B JWT |
| 3.3 | Cross-user INSERT into another user’s plan lineage fails (policy and/or trigger) | Y | Trigger: user_id must match parent plan owner |
| 3.4 | Anonymous `/plans` and `/sessions` redirect to sign-in | Y | Confirmed (also Phase 2) |
| 3.5 | Signed-in access to both placeholders succeeds | Y | Confirmed (also Phase 2) |

**Phase 3 complete only when all rows are Y.**
