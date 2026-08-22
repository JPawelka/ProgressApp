import type { TrainingGoal } from "@/types";

export const GOAL_LABELS: Record<TrainingGoal, string> = {
  mass: "Mass",
  strength: "Strength",
  endurance: "Endurance",
};

export function planDisplayName(name: string | null, goal: TrainingGoal): string {
  return name ?? `${GOAL_LABELS[goal]} plan`;
}

export function formatExerciseLoad(loadKg: string | null): string | null {
  if (!loadKg) {
    return null;
  }
  return `${loadKg} kg`;
}
