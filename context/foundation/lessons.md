# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Supabase numeric → string in entity types

- **Context**: `src/types.ts` — `default_load_kg`, `load_kg` (PostgREST `numeric`)
- **Problem**: Typing Supabase `numeric` columns as `number | null` mismatches runtime JSON, which often returns strings and can cause silent NaN bugs at first DB reads.
- **Rule**: Map Postgres `numeric` / decimal columns to `string | null` in shared entity types (or a branded decimal type); coerce to number only at display/calc boundaries.
- **Applies to**: plan, implement, impl-review

## Count-then-mutate is not a cardinality invariant

- **Context**: `src/lib/services/plan-edit.ts` — addExercise / deleteExercise count then insert/delete
- **Problem**: Two concurrent DELETEs at count=2 can leave 0 exercises; two concurrent POSTs at count=7 can yield 9. A 409 on the sequential path does not protect overlapping requests.
- **Rule**: Treat count-then-mutate as a sequential guard only; use a transactional lock/RPC when the count invariant must hold under concurrency.
- **Applies to**: plan, implement, impl-review
