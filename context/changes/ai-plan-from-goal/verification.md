# Verification: ai-plan-from-goal (S-02 / FR-002)

Repeatable local smoke for AI plan generation from a training goal (mass / strength / endurance).
Fill the checklist at the bottom when running Phase 4.

**Scope:** Generate plan via UI → persist `plans` + `plan_exercises` → read-only detail. Edit/delete UI is out of scope (S-03).

## Prerequisites

1. Supabase reachable with F-01 schema applied (`plans`, `plan_exercises` tables + RLS)
   - Local: `npx supabase start` then `npx supabase db reset` (or migrate)
   - Hosted: apply migrations from `supabase/migrations/` in the project dashboard
2. Env in `.dev.vars` (and `.env` if used): `SUPABASE_URL` + `SUPABASE_KEY` (see `.env.example`)
3. Plan generation available — **one of:**
   - **Dev mock (no OpenRouter spend):** `PLAN_GENERATION_MOCK=true` in `.dev.vars` — returns a fixed 4-exercise plan
   - **Real AI:** valid `OPENROUTER_API_KEY` with credits on the matching OpenRouter account
4. App running: `npm run dev`
5. Signed-in test user (sign up at `/auth/signup` or sign in at `/auth/signin`)

**Local Supabase Studio:** http://127.0.0.1:54323  
**Local API:** http://127.0.0.1:54321  

**Production note:** when enabling AI on the deployed Worker, set runtime secret: `npx wrangler secret put OPENROUTER_API_KEY` (see `context/changes/deployment/deployment-plan.md`). Do **not** set `PLAN_GENERATION_MOCK` in production.

---

## 1. Happy path — generate for each goal

For each goal (`mass`, `strength`, `endurance`):

1. Sign in → open `/plans`
2. Select the goal in **Generate a plan** → click **Generate plan**
3. Expect: redirect to `/plans/{planId}` with exercises visible (mock: 4 exercises; real AI: 3–8)
4. In Supabase **Table Editor** (or SQL):
   - `plans`: one new row for your user with matching `goal`
   - `plan_exercises`: 3–8 rows (mock: 4) with that `plan_id`, ordered by `sort_order`

Record each `planId` for step 3 below.

---

## 2. Failure path — no partial save

1. Note current row count in `plans` for your user
2. Disable mock and break OpenRouter:
   - Set `PLAN_GENERATION_MOCK=false` (or remove the line)
   - Set `OPENROUTER_API_KEY=bad-key` (or remove credits / use invalid key)
3. Restart `npm run dev`
4. Sign in → `/plans` → generate any goal
5. Expect: **in-UI error** on `/plans` (no redirect to detail); API returns error JSON
6. Expect: **no new row** in `plans`
7. Restore `.dev.vars` (mock and/or real key) when done

---

## 3. Auth gate

While **signed out** (sign out or incognito):

1. Open `/plans` → expect redirect to `/auth/signin`
2. Open `/plans/{any-uuid}` → expect redirect to `/auth/signin`

---

## 4. Multi-plan list

While signed in:

1. Generate **two** plans (any goals; mock mode is fine)
2. Open `/plans` → expect **two** entries in **Your plans**, newest first
3. Each list link opens a **distinct** `/plans/{id}` detail URL

---

## Pass / fail checklist

| # | Check | Pass? (Y/N) | Notes |
|---|--------|-------------|-------|
| 4.2a | Generate `mass` → detail page + DB rows (3–8 exercises) | | |
| 4.2b | Generate `strength` → detail page + DB rows | | |
| 4.2c | Generate `endurance` → detail page + DB rows | | |
| 4.3 | Failure path: UI/API error, no new `plans` row | | |
| 4.4 | Two generates → two list entries, distinct detail URLs | | |
| 4.5 | Anonymous `/plans` and `/plans/<id>` redirect to sign-in | | |

**Phase 4 / FR-002 complete only when all rows are Y.**

### Notes (environment quirks)

- Document port, Supabase target (local vs hosted), and mock vs real OpenRouter here.
