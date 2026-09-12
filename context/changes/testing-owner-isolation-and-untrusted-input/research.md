---
date: 2026-09-12T19:52:23+02:00
researcher: JPawelka
git_commit: f7ee2349f55b6b02b47c945fbec5626790d934cc
branch: main
repository: JPawelka/ProgressApp
topic: "Ground rollout Phase 3 — owner isolation (#3) and untrusted POST bodies (#7)"
tags: [research, codebase, ownership, idor, zod, rpc, lineage, vitest]
status: complete
last_updated: 2026-09-12
last_updated_by: JPawelka
---

# Research: Ground rollout Phase 3 — owner isolation (#3) and untrusted POST bodies (#7)

**Date**: 2026-09-12T19:52:23+02:00
**Researcher**: JPawelka
**Git Commit**: f7ee2349f55b6b02b47c945fbec5626790d934cc
**Branch**: main
**Repository**: JPawelka/ProgressApp

## Research Question

Ground rollout Phase 3 of `context/foundation/test-plan.md` ("Owner isolation and untrusted input").

Risks to verify: **#3** (User A reads or mutates User B’s plans/sessions via another user’s id), **#7** (untrusted client body for log/generate/edit stored as valid).

Risk response guidance to verify, not blindly accept:

- **#3**: prove other user’s id yields 401/404 and no row change; challenge “logged in is enough”; avoid mocking RLS away or only testing the unauthenticated redirect.
- **#7**: prove invalid body is 4xx and not stored; foreign/cross-plan ids do not attach; challenge “client validation is enough”; avoid testing only the TypeScript type.

Hot-spot directories (likelihood evidence, not anchors): `src`, `supabase/migrations` (§1). Stack: Vitest `node`, in-process fake client, no Playwright, no live Supabase / `APIContext` handler suite in the current cookbook (§4 / §6.2).

## Summary

Neither risk is speculative. Production already fails closed: **401** for missing API session, **404** `{ error: "Not found" }` (never 403) for missing or foreign resource ids, **400** for zod / RPC validation. Writes that would touch another owner’s row are filtered (`eq user_id`) or aborted in `SECURITY INVOKER` RPCs **before** insert/update. SSR foreign ids render a not-found **card** on HTTP 200 with no payload fields.

The CI gap is that **no test uses two identities or a fake RPC that returns `"Not found"` / `"Invalid sets"` / `"Invalid loads"`**. Existing tests construct error **classes** (`sessionLogFailure`, `progressionApplyFailure`) without calling `logSession` / `applyProgressionLoads`. `planEditFailure` and edit/generate **request** schemas have **no** unit tests.

**Cheapest useful layer (correcting the test-plan hypothesis):** stay inside the Phase 2 cookbook — in-process fake `from().update/delete().eq("user_id")` for plan edit, fake `rpc` for log/apply/add/delete exercise, plus missing **schema units** for generate/edit. Do **not** add Playwright, mock RLS to always return a row, or start a full `APIContext` handler suite. True two-JWT / `auth.uid()` proof still needs local Supabase or the archived **manual** verification steps; that is **not** the cheapest first test, and interview Q5 still excludes infrastructure archaeology.

## Detailed Findings

### Auth vs ownership (Risk #3)

Middleware only prefixes `/dashboard`, `/plans`, `/sessions`. Unauthenticated page hits redirect to `/auth/signin`. **`/api/*` is not gated** ([`src/middleware.ts:4-24`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/middleware.ts#L4-L24)).

Product APIs re-auth with `requirePlanApiAuth`: cookie `getUser()`, **401** `"Unauthorized"` if missing ([`src/lib/plans/plan-api.ts:20-36`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/plans/plan-api.ts#L20-L36)). That check proves **login**, not **ownership**.

Ownership for table writes is explicit `.eq("user_id", userId)` plus RLS:

- `updatePlanName` / `deletePlan` — [`src/lib/services/plan-edit.ts:79-117`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/services/plan-edit.ts#L79-L117)
- `updateExercise` also `.eq("plan_id")` — [`src/lib/services/plan-edit.ts:140-163`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/services/plan-edit.ts#L140-L163)

Empty `maybeSingle` → `PlanEditNotFoundError` → `planEditFailure` **404** ([`src/lib/services/plan-edit.ts:65-68`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/services/plan-edit.ts#L65-L68)). Filtered update/delete: **0 rows, then 404** — no foreign mutation.

RPC-backed services ignore the unused `_userId` argument and pass ids to SQL; ownership is `auth.uid()`:

- `logSession` — [`src/lib/services/session-log.ts:56-71`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/services/session-log.ts#L56-L71)
- `applyProgressionLoads` — [`src/lib/services/progression-apply.ts`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/services/progression-apply.ts) (`p_session_id` only)
- `addExercise` / `deleteExercise` — [`src/lib/services/plan-edit.ts:120-179`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/services/plan-edit.ts#L120-L179)

**SSR** loads by `eq("id")` only; isolation is **RLS**, not an app `user_id` filter ([`src/pages/plans/[id].astro:20-54`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/pages/plans/%5Bid%5D.astro#L20-L54)). Foreign/missing → “Plan not found” card, no fields. Same pattern: `/plans/[id]/log`, `/sessions/[id]/suggestion`.

**Must challenge (holds):** a test that only hits unauthenticated `/plans` redirect does **not** prove Risk #3. A test that stubs the DB to return User B’s row after login would **mock RLS away** and green-light a false owner.

### RLS and RPCs (Risk #3 + lineage for #7)

Owner policies on `plans`, `plan_exercises`, `sessions`, `session_sets` (`authenticated`, `auth.uid() = user_id`) live in `supabase/migrations/20260811122333_owner_scoped_persistence.sql`. Child **triggers** block B inserting a child with B’s `user_id` and A’s `plan_id` (F-01 review: RLS alone was not enough).

Log RPC locks the owner plan, then requires each `plan_exercise_id` on that plan + `auth.uid()` **before** session insert ([`supabase/migrations/20260829121500_log_training_session_rpc.sql:21-77`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/supabase/migrations/20260829121500_log_training_session_rpc.sql#L21-L77)).

Apply RPC locks owner session, then EXISTS on `sess.plan_id` + `auth.uid()`, then `EXCEPT` set-equality with `session_sets` ([`supabase/migrations/20260830221000_apply_progression_loads_rpc.sql:19-86`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/supabase/migrations/20260830221000_apply_progression_loads_rpc.sql#L19-L86)).

| Intent | RPC exception | HTTP via mapper |
|---|---|---|
| Other user’s plan/session id | `Not found` | **404** |
| Exercise id not on that plan / not owned | `Not found` | **404** |
| Apply loads ≠ logged exercises | `Invalid loads` | **400** |
| Duplicate / empty / out-of-range in RPC | `Invalid sets` / `Invalid loads` / `Empty *` | **400** |

Logged-in users **can invoke** RPCs with stolen UUIDs; GRANT is `TO authenticated`. Control is **inside** the function, not a per-owner EXECUTE grant.

### API write map

There are **no GET APIs** that load a plan/session by id.

| Method | Path | Zod on body | Ownership after 401 | Foreign / missing |
|---|---|---|---|---|
| POST | `/api/plans/generate` | `generatePlanRequestSchema` (goal only) | Creates with session user; no foreign id | N/A |
| PATCH | `/api/plans/[id]` | `patchPlanSchema` | `.eq user_id` | 404, 0-row update |
| DELETE | `/api/plans/[id]` | none | `.eq user_id` | 404, 0-row delete |
| POST | `/api/plans/[id]/exercises` | `exerciseWriteSchema` | RPC `add_plan_exercise` | 404 before insert |
| PATCH | `/api/plans/[id]/exercises/[exerciseId]` | `exerciseWriteSchema` | `.eq id+plan_id+user_id` | 404 |
| DELETE | `/api/plans/[id]/exercises/[exerciseId]` | none | RPC `delete_plan_exercise` | 404 before delete |
| POST | `/api/plans/[id]/sessions` | `logSessionSchema` | RPC `log_training_session` | 404 before insert ([`src/pages/api/plans/[id]/sessions.ts:8-37`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/pages/api/plans/%5Bid%5D/sessions.ts#L8-L37)) |
| POST | `/api/sessions/[id]/progression` | `applyProgressionSchema` | RPC `apply_progression_loads` | 404 before update ([`src/pages/api/sessions/[id]/progression.ts:8-37`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/pages/api/sessions/%5Bid%5D/progression.ts#L8-L37)) |

Generate rate-limit count has **no** app `user_id` filter ([`src/pages/api/plans/generate.ts`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/pages/api/plans/generate.ts)) — isolation depends on RLS. Does not return other users’ plans. **Speculative** if RLS is later disabled; not an IDOR leak today.

### Untrusted bodies (Risk #7)

**Client validation is not the trust boundary.** Every product write API runs server zod (except DELETE, which has no body). Island builders (`buildLogSessionSets`, `buildSaveLoads`, `EditPlanForm` parse) are UX only.

Log schema accepts **any well-formed UUID**; lineage is RPC ([`src/lib/sessions/session-log-schema.ts:1-23`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/sessions/session-log-schema.ts#L1-L23)). Same for apply ([`src/lib/progression/progression-apply-schema.ts:3-21`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/progression/progression-apply-schema.ts#L3-L21)).

Generate client cannot attach ids: `{ goal }` only, then `planAiSchema` after OpenRouter ([`src/lib/plans/plan-generation-schema.ts:18-20`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/plans/plan-generation-schema.ts#L18-L20)). Not `.strict()` — extra keys stripped in Zod 4, not 400.

Edit bodies have **no attachable ids**; path `planId` / `exerciseId` are **not** zod-uuid ([`src/lib/plans/plan-edit-schema.ts:14-26`](https://github.com/JPawelka/ProgressApp/blob/f7ee2349f55b6b02b47c945fbec5626790d934cc/src/lib/plans/plan-edit-schema.ts#L14-L26)). Wrong pair → 404, not silent attach.

**Must challenge (holds):** TypeScript `SessionSetWriteInput` passing a UUID is **not** proof the row is stored. A foreign UUID **passes** zod and must fail at RPC (404), not 201.

### Existing tests vs gaps

| Exists | Gap for Phase 3 |
|---|---|
| `session-log-schema.test.ts` — empty, incomplete, range, dup keys, `.strict()` extras | Document that a **foreign UUID still parses**; optional `not-a-uuid` |
| `progression-apply-schema.test.ts` — same family | **Do not redo** empty/dup/range (Phase 1). Foreign UUID still parses |
| `session-log.test.ts` / `progression-apply.test.ts` — mapper classes only | Call `logSession` / `applyProgressionLoads` with fake `rpc` `{ message: "Not found" }` / `"Invalid sets"` / `"Invalid loads"` — no success path |
| `plan-generation.test.ts` — persist fake client | `generatePlanRequestSchema` invalid/missing goal |
| none | `patchPlanSchema` / `exerciseWriteSchema`; `planEditFailure`; `updatePlanName`/`deletePlan`/`updateExercise` fake chain asserting `.eq("user_id")` + empty → not-found |
| none | Two-JWT live RLS |

**Do not redo:** apply zod cases; log completeness/omit builders; generate persist rollback; apply write-set builders; Playwright/jsdom; live `SELECT`.

### Lessons

`context/foundation/lessons.md`: numeric → string in entities (unrelated to IDOR). Count-then-mutate on plan-edit is a **concurrency** lesson, not Phase 3 (explicitly out of Phase 2 brief).

## Code References

- `src/middleware.ts:4-24` — page auth only; APIs ungated
- `src/lib/plans/plan-api.ts:20-36` — API 401
- `src/lib/services/plan-edit.ts:65-163` — 404 mapper + `user_id` filters
- `src/lib/services/session-log.ts:31-71` — RPC + 404/400 mapping
- `src/lib/services/progression-apply.ts:25-41` — RPC + 404/400 mapping
- `src/pages/api/plans/[id]/sessions.ts:8-37` — zod then log
- `src/pages/api/sessions/[id]/progression.ts:8-37` — zod then apply
- `src/pages/plans/[id].astro:20-54` — RLS-only read, not-found card
- `src/lib/sessions/session-log-schema.ts:1-23` — UUID shape, no lineage
- `src/lib/progression/progression-apply-schema.ts:3-21` — UUID shape, no lineage
- `src/lib/plans/plan-generation-schema.ts:18-20` — generate request
- `src/lib/plans/plan-edit-schema.ts:14-26` — edit bodies
- `supabase/migrations/20260829121500_log_training_session_rpc.sql:21-77` — owner lock + exercise EXISTS before insert
- `supabase/migrations/20260830221000_apply_progression_loads_rpc.sql:19-86` — session lock + lineage + EXCEPT
- `supabase/migrations/20260811122333_owner_scoped_persistence.sql` — RLS + child integrity triggers

## Architecture Insights

- **Defense in depth:** JWT + (app `eq user_id` **or** RPC `auth.uid()`) + RLS + lineage triggers. Tests that only assert “user object present” miss the product contract.
- **404 is the privacy status.** Missing and not-owned are indistinguishable. Do not assert 403.
- **Schema vs lineage:** zod proves shape; RPC proves attach. Phase 3 must split those oracles.
- **Cookbook tension:** test-plan §3 says “integration”; §6.2 still forbids live Supabase and handler suites. Phase 3 “integration” should mean **fake client/rpc at the service**, matching generate persist — not a new runner.
- **SSR HTTP 200 + empty card** is not a data leak. Astro page tests are expensive (no jsdom for `.astro`). Do not spend Phase 3 budget on rendering those cards.

## Historical Context (from prior changes)

- `context/archive/2026-08-11-gate-product-routes/` — F-01 RLS + triggers; cross-user SELECT empty; child hijack without triggers
- `context/archive/2026-08-22-edit-plan-exercises/plan.md` — unauthenticated `/plans/*` redirect; cross-user PATCH/DELETE **404**, zero-row not 200; `verification.md` isolation steps
- `context/archive/2026-08-29-log-training-session/plan.md` — stolen `plan_id` 404, no insert; middleware does not protect `/api/*`; triggers reject other-plan exercise ids
- `context/archive/2026-08-29-progression-suggest-override/plan.md` — not owner → 404, no updates
- `context/archive/2026-08-31-testing-critical-path-coverage/research.md` — “Auth ≠ ownership”; two-identity IDOR deferred to Phase 3; do not mock RLS away
- `context/changes/testing-persist-and-error-visibility/plan.md` / `research.md` — fake client pattern; no live SELECT / APIContext suite; IDOR and bodies beyond log/apply zod left to Phase 3

## Related Research

- `context/archive/2026-08-31-testing-critical-path-coverage/research.md`
- `context/changes/testing-persist-and-error-visibility/research.md`

## Open Questions

1. **Backport to test-plan §2 Risk Response Guidance (no file anchors):**
   - **#3 cheapest layer:** replace “Integration with two identities” with “Service + in-process fake client/rpc: assert `user_id` / stolen id → 404 and no success object. Live two-JWT remains manual/archive until a later infra phase.”
   - **#7 cheapest layer:** replace “Integration at POST handlers” with “Schema units for generate/edit; fake `rpc` for foreign UUID → 404 / Invalid loads → 400. Do not treat `z.infer` as coverage. Do not re-test log/apply shape cases already in Phase 1–2.”
2. Should Phase 3 add `planEditFailure` units (404/409/500) analogously to log/apply? **Yes — cheap, currently missing; 404 is the IDOR status for edit.**
3. Path-param garbage `:id` (non-UUID) → PostgREST vs 404: low value vs cookbook; skip unless research during implement shows a 500 leak.
4. Generate `planAiSchema` vs edit bounds (reps max, load max, `.strict()`): **AI payload**, not client-untrusted ids — out of #7 unless the plan explicitly wants AI-contract tests.

## Response-guidance verdict

| Risk | Guidance | Verdict |
|---|---|---|
| #3 prove 401/404 no write | Correct product contract | Keep. Unauthenticated **page** redirect is **not** this proof |
| #3 challenge logged-in is enough | Correct | Keep |
| #3 avoid mock RLS / unauth-only | Correct | Keep |
| #3 cheapest = two-identity integration | **Overstated** for current stack | Fake service client/rpc first |
| #7 prove 4xx + no attach | Correct | Keep; foreign UUID is **404 after zod pass**, not 400 |
| #7 challenge client validation | Correct — server zod exists | Tests must not use island builders as the oracle |
| #7 avoid TS-only | Correct | Keep |
| #7 cheapest = POST handler integration | **Too expensive / cookbook-forbidden** | Schema (generate/edit) + fake rpc |
| Speculative drop? | No | Risks describe missing **tests**, not missing **guards** |
| Misleading hot-spot? | No | #3/#7 sources are PRD/archive/abuse lens, not a wrong directory |
