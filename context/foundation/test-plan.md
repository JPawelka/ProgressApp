# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-12

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src`, `supabase/migrations`.

Protect the north-star loop first (suggestion after log, skip/accept/save, rule bounds), then persist + visible errors, then owner isolation and untrusted input. Do not spend budget on infrastructure archaeology or UI appearance.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | After a successful log, the owner never gets a next-session suggestion they can accept or override | High | High | interview Q1, Q3; PRD US-01, FR-005, FR-006; roadmap S-05; hot-spot dir `src/pages/sessions` (5 commits/30d), `src/components/sessions` (5 commits/30d), `src/pages/api` (7 commits/30d) |
| 2 | Plan or session save looks successful but rows are missing or incomplete | High | High | interview Q1; PRD FR-002, FR-004; archive S-04 incomplete-log risk; hot-spot dir `src/lib/services` (8 commits/30d), `src/pages/api` (7 commits/30d) |
| 3 | User A reads or mutates User B’s plans/sessions via another user’s id | High | Medium | interview Q1; PRD Access Control + privacy guardrail; archive F-01 / S-03 cross-user 404; abuse lens (authorization) |
| 4 | Generate / log / apply returns an error and the UI shows nothing, so the user proceeds as if it worked | High | High | interview Q2, Q4; hot-spot dir `src/components/plans`, `src/components/sessions` |
| 5 | Skip / Accept all / Save disagree with the product contract (skip still writes defaults; override ignored; skipped lifts still applied) | High | High | interview Q3, Q4; PRD FR-006; archive S-05 skip vs apply |
| 6 | Shown or applied load violates the locked rule (unexplained jump, or increase/hold/deload disagrees with logged sets) | High | Medium | PRD Business Logic + bounds guardrail; interview Q3; hot-spot dir `src/lib/progression` (3 commits/30d) — rule unit exists; apply path is the gap |
| 7 | Untrusted client body for log/generate/edit is stored as valid (invalid sets, ids that should not attach) | Medium | Medium | PRD FR-004; AGENTS validate APIs with zod; archive S-04 uniqueness/lineage; abuse lens (untrusted input) |

OpenRouter / host outage is High × Low — observability, not this rollout.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | After a successful log, the owner is offered increase/hold/deload + load for logged exercises; a missing session id does not silently skip that screen | “Log success implies the suggestion loop ran” | Log response → suggestion entry; skipped lifts omitted; unauthenticated vs owner | Integration on the log→suggestion contract | e2e gym tour; using the current redirect string as the oracle |
| #2 | Failed persist is visible as failure; posted complete sets are the ones that must land (or the call fails); incomplete POST elements are 400, not a 201 session. Incomplete UI drafts are omitted, not stored. | “Success status means the workout exists as entered” | Persist boundary, completeness rule, error translation | Unit: log schema + `sessionLogFailure` + omit/renumber builder; in-process fake client for generate persist | Live `SELECT`; re-testing Postgres; inventing “all exercises must be logged”; mirroring handler internals |
| #3 | Other user’s id yields 401/404 and no row change on their plan/session | “Logged in is enough” (auth ≠ ownership) | Ownership on GET vs mutate; zero-row vs data leak | Service + in-process fake client/rpc: `user_id` / stolen id → 404 and no success object. Live two-JWT remains manual/archive until a later infra phase | Mocking RLS away; only testing the unauthenticated redirect |
| #4 | Non-success / error payload from generate, log, or apply is shown; missing success id stays with an error and does not navigate | “If the island is still mounted, the user saw the error” | Error payload shape vs what the island renders | Unit on parse helpers (`errorMessageFromBody`, `planIdFromGenerateResponse`) under Vitest `node` | Pixel snapshots; Playwright; jsdom island mount |
| #5 | Skip leaves defaults unchanged; Accept all writes suggestions; Save writes field values; skipped lifts are not in the write set | “Suggestion screen shown means loads were applied” | Apply contract vs skip navigation | Integration on apply vs skip | Happy-path Accept all only |
| #6 | Decision + kg match the locked PRD rule (hits vs default reps, heaviest, +2.5), not whatever is currently shown | “Existing rule tests mean apply cannot be wrong” | Oracle = PRD/archive rule, not production output copied back | Unit with independent oracle | Implementation mirror |
| #7 | Invalid body is 4xx and not stored; foreign/cross-plan ids do not attach | “Client validation is enough” | Server schema vs lineage rules | Schema units for generate/edit; fake `rpc` for foreign UUID → 404 / Invalid loads → 400. Do not treat `z.infer` as coverage. Do not re-test log/apply shape cases already in Phases 1–2 | Testing only the TypeScript type |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical-path coverage | Prove suggestion appears after log; skip/accept/save match the contract; loads obey the locked rule | #1, #5, #6 | unit + integration | complete | testing-critical-path-coverage |
| 2 | Persist and error visibility | Prove plan/session saves are real and generate/log/apply failures are visible | #2, #4 | integration + island tests | complete | testing-persist-and-error-visibility |
| 3 | Owner isolation and untrusted input | Prove cross-user id is 401/404 with no write, and invalid bodies are rejected | #3, #7 | integration | complete | testing-owner-isolation-and-untrusted-input |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest via Astro `getViteConfig` | ^4.1.11 | `environment: node` (Astro 6); `npm test` = `vitest run`; pre-commit + CI already run it. Helpers under `src/lib/progression/`, `src/lib/sessions/`, `src/lib/http/`, `src/lib/plans/`, `src/lib/services/` |
| API mocking | in-process fake client | — | Generate persist, plan-edit writes (`eq user_id`), log/apply `rpc`. No mock library, no local Supabase, no `APIContext` handler suite |
| e2e | none yet | — | Deliberately out of this rollout (interview Q5: UI looks; cost × signal) |
| accessibility | none yet | — | Not a top risk in this map |
| AI-native | none | n/a | No browser MCP this session; vision/UI review excluded by Q5 |

**Test-base profile:** growing — Vitest configured; units for shown-load, log completeness/schema/failure mapping, generate `planId` + error body, generate persist fake client, apply schema + apply failure mapping, plan-edit ownership fakes, log/apply fake `rpc` lineage, generate/edit request schemas.

**Stack grounding tools (current session):**
- Docs: Context7 — Astro 6 Vitest/`getViteConfig`/`node` env; Vitest 4 `vitest run` and `.test.ts`; checked: 2026-08-31
- Search: not available in current session; checked: 2026-08-31
- Runtime/browser: none — not used; checked: 2026-08-31
- Provider/platform: none — not used; checked: 2026-08-31

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase \<N\>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required | syntactic / type drift |
| unit + integration (`npm test`) | local (husky) + CI | required; suite content grows with §3 Phases 1–3 | logic regressions on risks #1–#7 as those phases land |
| production build | CI | required | SSR/Worker compile + env wiring for the build |

No e2e, visual-diff, or post-edit-hook gates in this rollout (no named phase owns them; interview Q5).

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase \<N\>."

### 6.1 Adding a unit test

- **Location**: next to the helper under `src/lib/progression/` or `src/lib/sessions/`.
- **Naming**: `<module>.test.ts` (same stem as the module).
- **Reference tests**: `src/lib/progression/progression-rule.test.ts` (locked-rule oracle), `src/lib/progression/logged-suggestions.test.ts` (coerce + omit), `src/lib/sessions/session-id-from-log-response.test.ts`, `src/lib/sessions/log-session-sets.test.ts`, `src/lib/sessions/session-log-schema.test.ts`, `src/lib/http/error-message-from-body.test.ts`, `src/lib/plans/plan-id-from-generate-response.test.ts`, `src/lib/plans/plan-generation-schema.test.ts`, `src/lib/plans/plan-edit-schema.test.ts`, `src/lib/progression/progression-write-set.test.ts`.
- **Run locally**: `npm test`.
- **Oracle**: archive Phase 1 arithmetic — increase = heaviest + 2.5 kg, deload = heaviest × 0.9. Write expecteds as `100 + 2.5` / `82.5 * 0.9` (or test-file constants with that comment). Never `expect(fn(x)).toEqual(fn(x))`.
- **Skip vs apply**: Accept all vs Save are `buildAcceptAllLoads` / `buildSaveLoads`. Skip is a link with no POST — do not invent a skip RPC test.

### 6.2 Adding an integration test

There is still **no** live Supabase, RPC, or `APIContext` handler suite. Persist and ownership “integration” in this project means:

- **Location**: next to the schema or service (`src/lib/sessions/`, `src/lib/services/`, `src/lib/plans/`).
- **Log completeness**: `logSessionSchema` (archive ranges, empty/incomplete/dup keys) + `buildLogSessionSets` (omit/renumber) + `sessionLogFailure` (user-facing 400/404/500 copy). Do not `SELECT session_sets`.
- **Generate persist**: export `persistGeneratedPlan` and pass an in-process fake `from().insert()/.select().single()` / `delete().eq().eq()` client. Assert throw + compensating delete; do not call OpenRouter.
- **Apply mapping**: `progressionApplyFailure` status + `{ error }` strings. Schema cases already live in `progression-apply-schema.test.ts`.
- **Owner isolation**: fake `from().update/delete().eq("user_id")` empty `maybeSingle` → not-found (see `plan-edit.test.ts`). Fake `rpc` returning `{ message: "Not found" }` through `logSession` / `applyProgressionLoads`. Do **not** stub a successful row for a different `user_id`.
- **Untrusted body beyond log/apply shape**: `generatePlanRequestSchema` and `patchPlanSchema` / `exerciseWriteSchema`. A well-formed foreign UUID still **parses**; attach is the fake `rpc`, not zod.
- **Run locally**: `npm test`.
- **Do not**: Playwright, jsdom, a mock framework, executing Postgres, or mocking RLS to return another user’s row.

### 6.3 Adding an e2e test

Not in this rollout. Do not add Playwright tours for UI looks (see §7). Do not e2e the gym log→suggestion loop; the 201 `{ session.id }` contract is a unit helper.

### 6.4 Adding a test for a new API endpoint

Prefer the **schema**, **failure mapper**, and **write-set / omit builders** over a first handler mock. Apply-shaped POSTs: `applyProgressionSchema` + `progressionApplyFailure` + fake `rpc` for `"Not found"` / `"Invalid loads"`. Log-shaped POSTs: `logSessionSchema` + `sessionLogFailure` + `buildLogSessionSets` + fake `rpc` for `"Not found"` / `"Invalid sets"`. Plan writes: `patchPlanSchema` / `exerciseWriteSchema` + `planEditFailure` + fake `eq("user_id")`. Ownership 404 is that fake, not an `APIContext` handler.

### 6.5 Adding a test for error visibility on an island

- **Location**: `src/lib/http/error-message-from-body.ts` and domain parsers such as `src/lib/plans/plan-id-from-generate-response.ts` / `src/lib/sessions/session-id-from-log-response.ts`.
- **Naming**: `<module>.test.ts`.
- **Contract**: `!ok` / missing success id → non-empty message and no navigate. Generate missing `planId` is stay-with-error (same idea as missing `session.id`).
- **Run locally**: `npm test` (Vitest `node`).
- **Do not**: mount the React island, jsdom, Playwright, or snapshot `ServerError` CSS. “Island still mounted” is not the oracle.

### 6.6 Per-rollout-phase notes

Critical-path coverage (`testing-critical-path-coverage`): shown suggestions omit unlogged and un-coercible lifts — they do **not** invent hold from plan `default_load_kg`. Skip is `<a href="/sessions">` with no apply call. Apply stores client kg; it does not re-run increase/hold/deload.

Persist and error visibility (`testing-persist-and-error-visibility`): incomplete log drafts are omitted client-side; incomplete POST elements fail zod (400), they are not dropped into a 201. Generate persist is two inserts + compensating delete; exercise-insert failure throws. Generate `ok` without `planId` stays with an error.

Owner isolation and untrusted input (`testing-owner-isolation-and-untrusted-input`): empty filtered update/delete is 404, not 200. A well-formed UUID that still parses is **not** attach proof. Do not mock RLS to return another user’s row. Live two-JWT stays archive/manual.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Infrastructure deep-dives** — Worker/platform internals, hosted-only plumbing, and “prove the cloud” checks. Re-evaluate if a top-3 risk is proven to live only in that layer. (Source: Phase 2 interview Q5.)
- **UI looks** — layout, spacing, snapshot/visual diffs, marketing/static chrome. Re-evaluate if a failure is “user cannot see an error” (that is Risk #4, behavior, not pixels). (Source: Phase 2 interview Q5.)
- **shadcn primitives** — generated `src/components/ui/` controls. Re-evaluate if a primitive is forked. (Source: cost × signal + Q5.)
- **Provider outage as a test** — OpenRouter/Supabase/Cloudflare down. Use observability, not the suite. (Source: High × Low challenger pass.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-31
- Stack versions last verified: 2026-08-31
- AI-native tool references last verified: 2026-08-31 (none recommended)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
