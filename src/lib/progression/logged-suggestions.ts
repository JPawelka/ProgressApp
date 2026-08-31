import {
  suggestProgression,
  type ProgressionExerciseInput,
  type ProgressionSetInput,
  type ProgressionSuggestion,
} from "@/lib/progression/progression-rule";

export interface CoerceableSessionSet {
  plan_exercise_id: string;
  reps: unknown;
  load_kg: unknown;
}

export function coerceSessionSet(set: CoerceableSessionSet): ProgressionSetInput | null {
  if (set.reps == null || set.load_kg == null) {
    return null;
  }

  const reps = Number(set.reps);
  const load_kg = Number(set.load_kg);
  if (!Number.isFinite(reps) || !Number.isFinite(load_kg)) {
    return null;
  }

  return { plan_exercise_id: set.plan_exercise_id, reps, load_kg };
}

export function buildLoggedSuggestions(
  exercises: ProgressionExerciseInput[],
  sessionSets: CoerceableSessionSet[],
): ProgressionSuggestion[] {
  const sets = sessionSets.flatMap((set) => {
    const coerced = coerceSessionSet(set);
    return coerced ? [coerced] : [];
  });

  return suggestProgression(exercises, sets);
}
