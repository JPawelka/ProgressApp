import type { TrainingGoal } from "@/types";
import { requestPlanCompletion } from "@/lib/plans/openrouter";
import { planAiSchema, type ValidatedPlanPayload } from "@/lib/plans/plan-generation-schema";

export class PlanGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanGenerationError";
  }
}

/**
 * Goal → OpenRouter → zod-validated plan payload.
 * Does not persist to Supabase (persistence lands in Phase 2).
 */
export async function generatePlanFromGoal(goal: TrainingGoal): Promise<ValidatedPlanPayload> {
  const content = await requestPlanCompletion(goal);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content) as unknown;
  } catch {
    throw new PlanGenerationError("AI returned invalid JSON");
  }

  const result = planAiSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new PlanGenerationError("AI plan failed schema validation");
  }

  return result.data;
}

export type { ValidatedPlanPayload };
