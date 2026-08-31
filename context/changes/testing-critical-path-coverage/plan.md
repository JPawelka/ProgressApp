# Critical-path coverage Implementation Plan

## Overview

Add Vitest coverage for test-plan Phase 1 risks #1, #5, and #6 by extracting pure helpers (node environment, no Playwright/jsdom), removing the suggestion-page `default_load_kg` hold fallback so shown loads follow the locked rule, coercing both `reps` and `load_kg` at the calc boundary, and filling `context/foundation/test-plan.md` §6 with the patterns this rollout ships.

## Current State Analysis

The north-star loop is three seams. `POST /api/plans/[id]/sessions` returns `{ session }` 201 and does not compute suggestions (`src/pages/api/plans/[id]/sessions.ts:29-31`). `LogSessionForm` navigates to `/sessions/{id}/suggestion` only when `session.id` is a non-empty string; otherwise it stays with an error (`src/components/sessions/LogSessionForm.tsx:93-181`). Suggestions are computed on a later SSR GET: coerce `load_kg` only, run `suggestProgression`, omit ids not in `session_sets`, then **invent hold from `default_load_kg`** when the rule returns nothing for a logged id (`src/pages/sessions/[id]/suggestion.astro:25-88`). That fallback contradicts the archive rule (never read plan default for the decision).

Skip is `<a href="/sessions">` with no POST (`SuggestionForm.tsx:174-179`). Accept all posts prop `suggested_load_kg`; Save posts field values. Apply RPC stores client kg and requires payload ids to equal logged `session_sets` (`apply_progression_loads`). Existing automated tests: `src/lib/progression/progression-rule.test.ts` only (spec-literal expecteds, not an implementation mirror). Vitest is already `getViteConfig` + `environment: "node"`; CI/husky run `npm test`. Numeric lesson: coerce at calc/display only (`context/foundation/lessons.md`).

## Desired End State

Shown suggestions for a session equal `suggestProgression` over coerced finite reps+load sets; unlogged lifts and lifts with zero valid sets are omitted; plan `default_load_kg` is not used to invent a hold. After a 201 log body, a missing `session.id` is a stay-with-error, not a silent trip to `/sessions`. Accept-all vs Save write-sets are unit-tested from the locked product contract (original suggestions vs field values). Apply zod rejects empty/duplicate/out-of-range payloads. Skip remains a navigation link with no apply call. `npm test` encodes these cases with oracles from the archive/PRD arithmetic (`heaviest + 2.5`, `heaviest * 0.9`), not from copying `suggestProgression` output. Test-plan §6 names how to add the next unit test in this area.

### Key Discoveries:

- Log 201 does not imply the suggestion UI ran (`research.md` Risk #1; `sessions.ts:29-31`, `LogSessionForm.tsx:176-181`).
- Skip is not a server no-op; do not invent an RPC test for it (`research.md` Risk #5).
- Apply does not recompute the rule (`research.md` Risk #6; RPC updates `default_load_kg` from payload).
- `suggestion.astro:70-88` hold fallback is the shown-load hole; this plan removes it (planning decision).
- Cheapest layer: extracted helpers + zod. No mocked POST handlers, no live RPC (planning decision; interview Q5).

## What We're NOT Doing

- Playwright, jsdom, Testing Library, or island mount tests
- Mocked `POST` handler tests or local-Supabase RPC integration (Phase 2/3 of the test-plan own persist/IDOR)
- Session-list links to `/sessions/{id}/suggestion` (archive S-05 non-goal)
- Risks #2, #3, #4, #7
- Making apply SQL re-run increase/hold/deload
- Changing generate.ts helpers, auth middleware, or RLS
- Snapshot tests or UI-looks assertions

## Implementation Approach

Extract three pure modules under `src/lib/`, wire the existing Astro page and React islands to them, delete the fallback, then document the cookbook. Tests live next to those modules, same Vitest config. Product behavior changes only where planning locked them: coerce reps, omit instead of hold-from-default.

## Critical Implementation Details

**Oracle independence.** Rule and suggestion-builder tests must spell expected kg as archive arithmetic (`100 + 2.5`, `82.5 * 0.9`) or named *test-file* contract constants documented as coming from `context/archive/2026-08-29-progression-suggest-override/plan.md` Phase 1. Do not assign `expected = suggestProgression(...)` and assert equality.

**Fallback removal ordering.** Ship `buildLoggedSuggestions` and switch `suggestion.astro` in the same phase so production never keeps the fallback after the helper exists.

**Skip.** There is no skip helper that calls the API. Prove Accept/Save payloads in unit tests; keep Skip as an `<a href="/sessions">` with no `fetch`. Do not add a `skipProgression()` that posts empty loads.

## Phase 1: Shown-load contract

### Overview

Lock what the owner is *shown*: coerce reps and load, drop non-finite sets, omit unlogged and un-coercible lifts, never read `default_load_kg` for a fake hold. Extend the existing rule suite so expecteds stay contract-shaped.

**Behavior asserted:** Shown rows = locked rule on valid coerced sets only.  
**Regression caught:** Hold invented from plan default; string `load_kg`/`reps` breaking hit detection.  
**Research source:** `research.md` Risk #6 SSR drift; lessons.md numeric strings.  
**Edge:** All sets for a logged id fail coerce → lift omitted (empty list possible).  
**Anti-pattern avoided:** Implementation-mirror expecteds; snapshot of current `suggestion.astro` output.

### Changes Required:

#### 1. Coerce + logged suggestion builder

**File**: `src/lib/progression/logged-suggestions.ts` (new)

**Intent**: Single calc-boundary for session rows so the Astro page cannot reintroduce `default_load_kg` hold. Coerce both `reps` and `load_kg` with `Number()`; drop null/non-finite.

**Contract**: Export `coerceSessionSet(set)` → `{ plan_exercise_id, reps, load_kg } | null`. Export `buildLoggedSuggestions(exercises, sessionSets)` → `ProgressionSuggestion[]` in exercise input order: include an exercise only if at least one coerced set exists; pass coerced sets into `suggestProgression`; do not read `default_load_kg`. `sessionSets` may still contain the unlogged extras; those ids simply yield no coerced sets / no row.

#### 2. Wire suggestion page

**File**: `src/pages/sessions/[id]/suggestion.astro`

**Intent**: Page loads data; helper computes rows. Remove the inline `coerceSet` and the hold-from-default block (`:70-88`).

**Contract**: After successful set/exercise fetch, `suggestions = buildLoggedSuggestions(exercises, rawSets)`. No remaining reference to `exercise.default_load_kg` on this page.

#### 3. Rule tests + builder tests

**Files**: `src/lib/progression/progression-rule.test.ts`, `src/lib/progression/logged-suggestions.test.ts` (new)

**Intent**: Independent oracle for math and for omit/coerce. Prove non-finite drop inside the rule.

**Contract**: Rewrite rule expected kg using `100 + 2.5` / `80 * 0.9` / `82.5 * 0.9` (or test-local contract constants with a one-line comment pointing at the archive Phase 1 numbers). Add a rule case that a non-finite load/reps set is ignored when a sibling set is valid. Builder tests: string `"100"` load and string `"5"` reps produce increase `100 + 2.5`; exercise with only un-coercible sets omitted; exercise with zero `session_sets` omitted; **no** test that expects hold from `default_load_kg`.

### Success Criteria:

#### Automated Verification:

- `src/lib/progression/logged-suggestions.ts` exports `coerceSessionSet` and `buildLoggedSuggestions`
- `suggestion.astro` does not read `default_load_kg`
- `npm test` covers contract-shaped rule expecteds, non-finite drop, string coerce, omit of unlogged / un-coercible lifts
- `npm run lint` passes

#### Manual Verification:

- Log a session with one complete lift and one left blank: suggestion page lists only the logged lift (no invented hold for the blank)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Log id + apply write-set

### Overview

Lock the log→suggestion *entry* contract (usable `session.id` vs stay) and the Accept all / Save payloads. Skip stays a link. Zod covers apply body shape (not SQL EXCEPT).

**Behavior asserted:** Missing `session.id` is not treated as navigation success; Accept all uses original suggested kg; Save uses parsed fields or fails closed; schema rejects empty/duplicate/out-of-range loads.  
**Regression caught:** Silent `/sessions` after 201 without id (already absent — lock it); Accept all accidentally posting field edits; Save posting despite invalid kg.  
**Research source:** `research.md` Risk #1 `readSessionId`; Risk #5 write-set.  
**Edge:** Empty JSON, non-string id, Save incomplete field → no payload.  
**Anti-pattern avoided:** Redirect URL as product oracle; Skip-as-RPC; happy-path Accept all only.

### Changes Required:

#### 1. Log response session id

**File**: `src/lib/sessions/session-id-from-log-response.ts` (new)

**Intent**: Testable 201-body contract without mounting `LogSessionForm`.

**Contract**: `sessionIdFromLogResponse(data: unknown): string | null` — non-empty string `data.session.id` or `null`. Used after `response.json()`; the form still handles `!response.ok` separately.

#### 2. Wire log form

**File**: `src/components/sessions/LogSessionForm.tsx`

**Intent**: Same UX; parse via the helper. Keep the existing error copy when id is missing.

**Contract**: Replace inline `readSessionId` with `sessionIdFromLogResponse`. Success navigation remains `/sessions/${id}/suggestion` (implementation detail, not a test oracle). Missing id: stay, show `"Session saved but the suggestion page could not be opened"`.

#### 3. Write-set builders

**File**: `src/lib/progression/progression-write-set.ts` (new)

**Intent**: Separate Accept all vs Save so tests do not mount React. Skip is not a function here.

**Contract**: `buildAcceptAllLoads(suggestions)` → `{ plan_exercise_id, load_kg: suggested_load_kg }[]` in suggestion order (ignore any field map). `buildSaveLoads(suggestions, fieldMap: Record<string, string>)` → `{ ok: true, loads } | { ok: false }` using the same 0–9999.99 finite rules as today’s `completeLoad`. Do not omit suggestion rows on Save (island posts the full shown set).

#### 4. Wire suggestion island

**File**: `src/components/sessions/SuggestionForm.tsx`

**Intent**: Accept all / Save call the builders then the existing `submit`. Skip remains `<a href="/sessions">` with no `fetch`.

**Contract**: `acceptAll` uses `buildAcceptAllLoads(suggestions)`. `save` uses `buildSaveLoads`; on `ok: false` keep the existing inline error, no POST. Skip markup stays an anchor to `/sessions`.

#### 5. Schema tests

**Files**: `src/lib/sessions/session-id-from-log-response.test.ts` (new), `src/lib/progression/progression-write-set.test.ts` (new), `src/lib/progression/progression-apply-schema.test.ts` (new)

**Intent**: Lock 201 shape, both write-sets, and zod failures without handlers.

**Contract**: Session id: `{ session: { id: "uuid-string" } }` → that string; missing/empty/non-string id → `null`. Write-set: Accept all ignores edited field map; Save uses map; invalid Save → `ok: false`. Schema: `applyProgressionSchema` rejects empty `loads`, duplicate `plan_exercise_id`, `load_kg` outside 0–9999.99, extra keys (`.strict()`). Do not test RPC `EXCEPT` here.

### Success Criteria:

#### Automated Verification:

- `sessionIdFromLogResponse` and write-set builders are used by the form/island
- Skip in `SuggestionForm.tsx` is still an `<a href="/sessions">` with no `fetch` on that control
- `npm test` includes the session-id, write-set, and apply-schema cases above
- `npm run lint` passes

#### Manual Verification:

- Skip from a suggestion screen returns to `/sessions` without changing plan default loads (Studio or plan edit)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Cookbook

### Overview

Record how to add tests for this area so the next agent does not invent Playwright or copy production output as the oracle.

**Behavior asserted:** Cookbook names location, naming, oracle rule, and Skip/apply split.  
**Regression caught:** Future tests e2e the gym loop or mirror `suggestProgression`.  
**Research source:** test-plan §6 placeholders; this plan’s layers.  
**Edge:** n/a.  
**Anti-pattern avoided:** Empty TBD left after the phase ships.

### Changes Required:

#### 1. Test-plan cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Fill §6.1, §6.2 (as far as this phase goes), and §6.6 from what landed. Do not add file:line anchors to §2. Optionally add `src/pages/api` to Risk #1 Source as hot-spot evidence only (research backport) — no function names.

**Contract**: §6.1: unit tests live next to helpers under `src/lib/progression/` and `src/lib/sessions/`; naming `*.test.ts`; run `npm test`; oracle = archive +2.5 / ×0.9 arithmetic; never `expect(fn(x)).toEqual(fn(x))`. §6.2: this rollout did **not** add API integration; say so and point persist/IDOR to §3 Phases 2–3. §6.4 can note write-set + zod as the Phase 1 stand-in for apply POST. §6.6: three-line note — fallback removed; Skip is a link; apply does not recompute the rule. Bump header Last updated.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` §6.1 is no longer TBD
- `npm test` still passes
- `npm run lint` passes

#### Manual Verification:

- Skim §6: a new unit test for a progression helper would follow §6.1 without opening Playwright

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Rule: hit/miss/mixed/null/omit/clamp/rounding with contract-shaped expecteds; non-finite sibling drop
- `buildLoggedSuggestions` / `coerceSessionSet`: string numerics; omit unlogged and un-coercible
- `sessionIdFromLogResponse`: present vs missing id
- `buildAcceptAllLoads` vs `buildSaveLoads`: edits ignored vs applied; Save fail-closed
- `applyProgressionSchema`: empty, duplicate ids, range, strict extras

### Integration Tests:

- None in this change (no mocked handlers, no live RPC)

### Manual Testing Steps:

1. Log one complete exercise and leave another blank → only the logged lift on the suggestion page
2. Skip → `/sessions`, plan defaults unchanged
3. (Optional) Accept all / Save still work as before — not the automated oracle for kg math

## Performance Considerations

Helpers run on the same SSR request as today (≤8 exercises). No extra queries.

## Migration Notes

No database migration. Hosted schema unchanged. Removing the fallback can yield an empty suggestion list when every logged set fails coerce — Accept/Save stay hidden; Skip remains.

## References

- Related research: `context/changes/testing-critical-path-coverage/research.md`
- Test plan: `context/foundation/test-plan.md` §2 risks #1, #5, #6; §3 Phase 1
- Archive rule: `context/archive/2026-08-29-progression-suggest-override/plan.md` Phase 1
- Numeric lesson: `context/foundation/lessons.md`
- Rule module: `src/lib/progression/progression-rule.ts`
- Suggestion page: `src/pages/sessions/[id]/suggestion.astro`
- Log form: `src/components/sessions/LogSessionForm.tsx`
- Suggestion island: `src/components/sessions/SuggestionForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shown-load contract

#### Automated

- [x] 1.1 `src/lib/progression/logged-suggestions.ts` exports `coerceSessionSet` and `buildLoggedSuggestions` — ccde455
- [x] 1.2 `suggestion.astro` does not read `default_load_kg` — ccde455
- [x] 1.3 `npm test` covers contract-shaped rule expecteds, non-finite drop, string coerce, omit of unlogged / un-coercible lifts — ccde455
- [x] 1.4 `npm run lint` passes — ccde455

#### Manual

- [x] 1.5 Log a session with one complete lift and one left blank: suggestion page lists only the logged lift (no invented hold for the blank) — ccde455

### Phase 2: Log id + apply write-set

#### Automated

- [x] 2.1 `sessionIdFromLogResponse` and write-set builders are used by the form/island
- [x] 2.2 Skip in `SuggestionForm.tsx` is still an `<a href="/sessions">` with no `fetch` on that control
- [x] 2.3 `npm test` includes the session-id, write-set, and apply-schema cases above
- [x] 2.4 `npm run lint` passes

#### Manual

- [x] 2.5 Skip from a suggestion screen returns to `/sessions` without changing plan default loads (Studio or plan edit)

### Phase 3: Cookbook

#### Automated

- [ ] 3.1 `context/foundation/test-plan.md` §6.1 is no longer TBD
- [ ] 3.2 `npm test` still passes
- [ ] 3.3 `npm run lint` passes

#### Manual

- [ ] 3.4 Skim §6: a new unit test for a progression helper would follow §6.1 without opening Playwright
