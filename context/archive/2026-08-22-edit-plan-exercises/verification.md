# Verification: edit-plan-exercises (S-03 / FR-003)

Repeatable smoke for viewing and editing a generated plan in place (rename, edit exercises, add/remove within 1–8, delete the plan). Fill the checklist at the bottom when running Phase 3.

**Scope:** Owner edits on `/plans/[id]` plus JSON APIs. Session logging is out of scope (S-04). Goal is a generation label only.

## Prerequisites

1. Supabase reachable with F-01 schema **and** cardinality RPCs applied:
   - Tables + RLS: `plans`, `plan_exercises` (`supabase/migrations/20260811122333_owner_scoped_persistence.sql`)
   - Functions: `add_plan_exercise`, `delete_plan_exercise` (`supabase/migrations/20260829103000_plan_exercise_cardinality_rpc.sql`)
   - **The database in `.dev.vars` `SUPABASE_URL` is the one that matters.** If that URL is `*.supabase.co`, apply SQL on the **hosted** project (Dashboard → SQL Editor). Local Studio at `127.0.0.1:54323` does not change hosted data.
   - Local alternative: `npx supabase start` then `npx supabase db reset` (or migrate) **and** point `.dev.vars` at that local API.
2. Env: `SUPABASE_URL` + `SUPABASE_KEY` in `.dev.vars` (see `.env.example`)
3. App running: `npm run dev`
4. Signed-in test user with **at least one generated plan** that has **3–8 exercises** (generate on `/plans` if needed; mock or real OpenRouter is fine)
5. Optional for isolation: a **second account** (or Studio acting as another `auth.uid()`)

**If add/delete returns** `Could not find the function public.add_plan_exercise`: the RPC migration is not in that project's schema cache. Run the migration SQL, then retry.

**PostgREST:** after creating functions in SQL Editor, `NOTIFY pgrst, 'reload schema'` is in the migration; if the schema cache is stale, wait a few seconds or reload.

---

## 1. Happy path — edit in place

While signed in as the plan owner:

1. Open `/plans` → open one plan → `/plans/{planId}`
2. Change the **plan name** → Save → hard-refresh. Expect the new name (empty name falls back to the goal label).
3. On one exercise, change **name**, **reps**, and/or **load** → Save that row → hard-refresh. Expect values to stick.
4. **Add exercise** with a name (reps/load optional) → it appears **last**. Optional Studio/SQL: new row `sort_order` equals previous `max(sort_order) + 1`.
5. **Delete** a non-last exercise: first click shows in-island confirm (“Remove this exercise… cannot be undone”). Confirm → row gone. Cancel leaves the row.

---

## 2. Bounds — 1 to 8 exercises

1. Add until the plan has **8** exercises. Expect: add form hidden; copy “This plan already has 8 exercises.”
2. Force a 9th via API (signed-in, cookies) — expect **409**, message **Plan cannot have more than 8 exercises**, row count stays 8:

   ```js
   fetch(`/api/plans/${PLAN_ID}/exercises`, {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ name: "Should not exist", default_reps: 8, default_load_kg: null }),
   }).then(async (r) => console.log(r.status, await r.json()));
   ```

3. Delete down to **1** exercise. Expect: no per-exercise delete control on the last row.
4. Force delete of that last exercise via API — expect **409**, message **Plan must have at least one exercise**, the row remains:

   ```js
   fetch(`/api/plans/${PLAN_ID}/exercises/${LAST_EXERCISE_ID}`, { method: "DELETE" }).then(
     async (r) => console.log(r.status, await r.json()),
   );
   ```

Use `plan_exercises.id` (or POST response `exercise.id`), not the plan URL id.

---

## 3. Delete plan

1. On detail, click **Delete plan** → in-island confirm (plan + exercises; later sessions too) → **Confirm delete plan**.
2. Expect: redirect to `/plans`; that plan is **gone from the list**.
3. Open `/plans/{deletedId}` while still signed in → **plan not found** (same as a missing/foreign id).

---

## 4. Auth

While **signed out** (sign out or a private window):

1. Open `/plans/{any-uuid}` → redirect to `/auth/signin`
2. Call an edit API without cookies — expect **401** `{ error: "Unauthorized" }`:

   ```js
   fetch(`/api/plans/${PLAN_ID}`, {
     method: "PATCH",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ name: "Should fail" }),
   }).then(async (r) => console.log(r.status, await r.json()));
   ```

---

## 5. Isolation (cross-user)

As **user B**, using user A’s `planId` / exercise id:

1. `PATCH /api/plans/{A's id}` with a new name → **404**, A’s row unchanged
2. `DELETE /api/plans/{A's id}/exercises/{A's exercise id}` → **404**, row still present for A
3. Opening `/plans/{A's id}` as B → not-found card (SSR), not A’s data

A second account is enough. Do not use another user’s cookies in A’s browser session.

---

## 6. Goal is read-only

On `/plans/{id}`, the training goal is **visible** (label) and there is **no** control to change `goal`. Regenerating still happens only on `/plans`.

---

## Pass / fail checklist

| # | Check | Pass? (Y/N) | Notes |
|---|--------|-------------|-------|
| 3.2 | Happy path: rename, edit one exercise, add appended, delete non-last after confirm | Y | Covered by Phase 2 (2.4–2.6); no app code after `5166ce4` |
| 3.3 | Bounds: no 9th (UI + 409); no last-exercise delete (UI + 409) | Y | Covered by Phase 2 (2.5–2.6, 2.10) |
| 3.4 | Delete plan: confirm → gone from list; `/plans/{id}` not-found | Y | Covered by Phase 2 (2.7) |
| 3.5a | Signed-out `/plans/[id]` → sign-in; unauthenticated API → 401 | Y | Covered by Phase 2 (2.9) and Phase 1 (1.9) |
| 3.5b | Other user PATCH/DELETE → 404, row unchanged | Y | Covered by Phase 1 (1.10) |
| — | Goal displayed, not editable | Y | Covered by Phase 2 (2.8) |

**Phase 3 / FR-003 complete only when all rows are Y.**

### Notes (environment quirks)

- Document port, Supabase target (local vs hosted), and whether RPCs were applied via migration or pasted SQL.
- Cardinality add/delete is RPC-backed; plan DELETE is table DELETE + CASCADE (not blocked by the 1-exercise floor).
