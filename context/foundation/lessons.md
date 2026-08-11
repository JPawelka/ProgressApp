# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Supabase numeric → string in entity types

- **Context**: `src/types.ts` — `default_load_kg`, `load_kg` (PostgREST `numeric`)
- **Problem**: Typing Supabase `numeric` columns as `number | null` mismatches runtime JSON, which often returns strings and can cause silent NaN bugs at first DB reads.
- **Rule**: Map Postgres `numeric` / decimal columns to `string | null` in shared entity types (or a branded decimal type); coerce to number only at display/calc boundaries.
- **Applies to**: plan, implement, impl-review
