import type { TrainingGoal } from "@/types";
import { planAiSchema, type ValidatedPlanPayload } from "@/lib/plans/plan-generation-schema";

const GOAL_LABEL: Record<TrainingGoal, string> = {
  mass: "Mass",
  strength: "Strength",
  endurance: "Endurance",
};

/** Deterministic schema-valid plan for local dev when PLAN_GENERATION_MOCK is enabled. */
export function buildMockPlanPayload(goal: TrainingGoal): ValidatedPlanPayload {
  const payload = {
    name: `Mock ${GOAL_LABEL[goal]} plan`,
    exercises: [
      { name: "Back squat", default_reps: 8, default_load_kg: 60 },
      { name: "Bench press", default_reps: 8, default_load_kg: 40 },
      { name: "Barbell row", default_reps: 10, default_load_kg: 35 },
      { name: "Romanian deadlift", default_reps: 10, default_load_kg: 50 },
    ],
  };

  return planAiSchema.parse(payload);
}
