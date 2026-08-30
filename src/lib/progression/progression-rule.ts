export type ProgressionDecision = "increase" | "hold" | "deload";

export interface ProgressionExerciseInput {
  id: string;
  name: string;
  default_reps: number | null;
}

export interface ProgressionSetInput {
  plan_exercise_id: string;
  reps: number;
  load_kg: number;
}

export interface ProgressionSuggestion {
  plan_exercise_id: string;
  name: string;
  decision: ProgressionDecision;
  suggested_load_kg: number;
  heaviest_load_kg: number;
}

const MIN_LOAD_KG = 0;
const MAX_LOAD_KG = 9999.99;
const INCREASE_KG = 2.5;
const DELOAD_FACTOR = 0.9;

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function roundLoad(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampLoad(value: number): number {
  return Math.min(MAX_LOAD_KG, Math.max(MIN_LOAD_KG, roundLoad(value)));
}

function decide(
  defaultReps: number | null,
  sets: ProgressionSetInput[],
  heaviest: number,
): { decision: ProgressionDecision; suggested: number } {
  if (defaultReps === null) {
    return { decision: "hold", suggested: heaviest };
  }

  const hits = sets.map((set) => set.reps >= defaultReps);
  const allHit = hits.every(Boolean);
  const allMiss = hits.every((hit) => !hit);

  if (allHit) {
    return { decision: "increase", suggested: heaviest + INCREASE_KG };
  }
  if (allMiss) {
    return { decision: "deload", suggested: heaviest * DELOAD_FACTOR };
  }
  return { decision: "hold", suggested: heaviest };
}

export function suggestProgression(
  exercises: ProgressionExerciseInput[],
  sets: ProgressionSetInput[],
): ProgressionSuggestion[] {
  const setsByExercise = new Map<string, ProgressionSetInput[]>();

  for (const set of sets) {
    if (!isFiniteNumber(set.reps) || !isFiniteNumber(set.load_kg)) {
      continue;
    }
    const existing = setsByExercise.get(set.plan_exercise_id);
    if (existing) {
      existing.push(set);
    } else {
      setsByExercise.set(set.plan_exercise_id, [set]);
    }
  }

  const suggestions: ProgressionSuggestion[] = [];

  for (const exercise of exercises) {
    const exerciseSets = setsByExercise.get(exercise.id);
    if (!exerciseSets || exerciseSets.length === 0) {
      continue;
    }

    const heaviest = Math.max(...exerciseSets.map((set) => set.load_kg));
    const { decision, suggested } = decide(exercise.default_reps, exerciseSets, heaviest);

    suggestions.push({
      plan_exercise_id: exercise.id,
      name: exercise.name,
      decision,
      suggested_load_kg: clampLoad(suggested),
      heaviest_load_kg: clampLoad(heaviest),
    });
  }

  return suggestions;
}
