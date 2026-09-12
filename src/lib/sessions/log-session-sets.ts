import type { SessionSetWriteInput } from "@/lib/sessions/session-log-schema";

/** Archive complete-set cap: 1–8 sets per exercise. */
export const MAX_SETS_PER_EXERCISE = 8;

export const EMPTY_LOG_SETS_ERROR = "Log at least one complete set (reps and load)";
export const MAX_SETS_PER_EXERCISE_ERROR = "Each exercise can have at most 8 sets";

export interface LogSetDraft {
  reps: string;
  load: string;
}

function parseReps(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return Number.NaN;
  }
  return parsed;
}

function parseLoad(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return Number(trimmed);
}

function isCompleteSet(draft: LogSetDraft): { reps: number; load_kg: number } | null {
  const reps = parseReps(draft.reps);
  const load = parseLoad(draft.load);
  if (reps === null || load === null) {
    return null;
  }
  if (!Number.isInteger(reps) || reps < 1 || reps > 100) {
    return null;
  }
  if (!Number.isFinite(load) || load < 0 || load > 9999.99) {
    return null;
  }
  return { reps, load_kg: load };
}

export type BuildLogSessionSetsResult = { ok: true; sets: SessionSetWriteInput[] } | { ok: false; error: string };

/**
 * Omit incomplete drafts, renumber complete sets 1..n per exercise.
 * Incomplete = blank or out of archive ranges (reps 1–100, load 0–9999.99).
 */
export function buildLogSessionSets(
  exercises: { id: string }[],
  rows: Record<string, LogSetDraft[]>,
): BuildLogSessionSetsResult {
  const sets: SessionSetWriteInput[] = [];

  for (const exercise of exercises) {
    const list = rows[exercise.id] ?? [];
    let setNumber = 1;
    for (const draft of list) {
      const complete = isCompleteSet(draft);
      if (!complete) {
        continue;
      }
      if (setNumber > MAX_SETS_PER_EXERCISE) {
        return { ok: false, error: MAX_SETS_PER_EXERCISE_ERROR };
      }
      sets.push({
        plan_exercise_id: exercise.id,
        set_number: setNumber,
        reps: complete.reps,
        load_kg: complete.load_kg,
      });
      setNumber += 1;
    }
  }

  if (sets.length === 0) {
    return { ok: false, error: EMPTY_LOG_SETS_ERROR };
  }

  return { ok: true, sets };
}
