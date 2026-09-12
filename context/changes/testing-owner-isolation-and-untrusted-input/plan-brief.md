# Owner isolation and untrusted-input tests — Plan Brief

> Full plan: `context/changes/testing-owner-isolation-and-untrusted-input/plan.md`
> Research: `context/changes/testing-owner-isolation-and-untrusted-input/research.md`

## What & Why

CI must prove User A cannot treat User B’s ids as writable (404, no success row) and that untrusted generate/edit bodies plus foreign UUIDs are not “stored as valid” just because TypeScript or the island accepted them. Guards already exist; tests do not.

## Starting Point

Vitest covers log/apply **shape**, failure **classes**, and generate persist with a fake client. Nothing calls `logSession` / `applyProgressionLoads` / plan-edit writes with a fake that returns empty or `"Not found"`. Generate/edit request schemas are untested. Cookbook still says two-identity IDOR waits for Phase 3.

## Desired End State

`npm test` fails if `user_id` filters disappear or RPC `"Not found"` is mapped to success. A second well-formed UUID still parses (shape ≠ attach). Generate `goal` and edit fields are server-zod tested. Cookbook tells the next author to extend those fakes, not Playwright or local Supabase.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test layer | Fake `from`/`rpc` at services | Matches Phase 2 cookbook; live two-JWT is infra | Research + Plan |
| API 401 | Skip `requirePlanApiAuth` tests | Login ≠ ownership; handler suite forbidden | Plan |
| Schemas | Generate + edit + foreign UUID still parses | Remaining #7 gaps; do not redo log/apply ranges | Research + Plan |
| `planAiSchema` / not-a-uuid | Out | Not client attach ids; low signal | Research + Plan |
| Two-JWT | Optional archive manual | Q5; not a CI gate | Plan |
| Phases | Edit ownership → log/apply rpc → schemas + cookbook | Cost × signal, #3 first | Plan |

## Scope

**In scope:** `plan-edit.test.ts` fake chains + `planEditFailure`; fake `rpc` on log/apply (optional add/delete exercise); one parse≠attach test each on log/apply schemas; generate/edit schema units; cookbook + §2 cheapest-layer backport.

**Out of scope:** Product changes; Playwright; live DB; mock RLS returning B’s row; 401 helpers; `planAiSchema`; path-param junk; concurrency races.

## Architecture / Approach

Same as generate persist: in-process objects that implement the `eq`/`maybeSingle` or `rpc` surface the services already call. Oracles are archive 404/400 copy and schema enums/bounds. Last phase edits `test-plan.md` only in §2 cheapest-layer cells (no file anchors) and §6 cookbook.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Plan-edit ownership | Empty-row 404 + mapper | Stubbing a foreign success row |
| 2. Log/apply lineage | Fake rpc + parse≠attach | Re-testing zod shape; claiming parse is attach |
| 3. Schemas + cookbook | Generate/edit units; §6/§2 | File:line sneaking into §2 |

**Prerequisites:** Phase 2 persist tests already on `main` (fake-client pattern).
**Estimated effort:** ~1 session across 3 implement slices.

## Open Risks & Assumptions

- Fake `rpc` cannot prove `auth.uid()` inside Postgres; that remains archive/manual.
- Implement must not “help” by returning another user’s row in the fake.

## Success Criteria (Summary)

- Stolen id → 404 mapper, no success object, `user_id` (or rpc name) captured
- Foreign UUID parses; invalid generate/edit bodies do not
- Cookbook no longer points IDOR at a future phase or at Playwright
