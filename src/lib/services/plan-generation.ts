import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrainingGoal } from "@/types";
import { isPlanGenerationAvailable, isPlanGenerationMockEnabled } from "@/lib/plans/plan-generation-config";
import { buildMockPlanPayload } from "@/lib/plans/mock-plan-payload";
import { requestPlanCompletion } from "@/lib/plans/openrouter";
import { planAiSchema, type ValidatedPlanPayload } from "@/lib/plans/plan-generation-schema";

export class PlanGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanGenerationError";
  }
}

export class PlanPersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanPersistError";
  }
}

/**
 * Goal → OpenRouter → zod-validated plan payload.
 * Does not persist to Supabase.
 */
export async function generatePlanFromGoal(goal: TrainingGoal): Promise<ValidatedPlanPayload> {
  if (isPlanGenerationMockEnabled()) {
    return buildMockPlanPayload(goal);
  }

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

function toLoadKg(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  return value.toFixed(2);
}

/** Untyped Supabase client collapses insert results; narrow at the boundary. */
interface RowResult<T> {
  data: T | null;
  error: { message: string } | null;
}

async function persistGeneratedPlan(
  supabase: SupabaseClient,
  userId: string,
  goal: TrainingGoal,
  payload: ValidatedPlanPayload,
): Promise<string> {
  const { data: plan, error: planError } = (await supabase
    .from("plans")
    .insert({
      user_id: userId,
      goal,
      name: payload.name,
    })
    .select("id")
    .single()) as RowResult<{ id: string }>;

  if (planError || !plan) {
    throw new PlanPersistError(planError?.message ?? "Failed to create plan");
  }

  const planId = plan.id;

  const exerciseRows = payload.exercises.map((exercise, index) => ({
    user_id: userId,
    plan_id: planId,
    name: exercise.name,
    sort_order: index,
    default_reps: exercise.default_reps,
    default_load_kg: toLoadKg(exercise.default_load_kg),
  }));

  const { error: exercisesError } = (await supabase.from("plan_exercises").insert(exerciseRows)) as RowResult<unknown>;

  if (exercisesError) {
    await supabase.from("plans").delete().eq("id", planId).eq("user_id", userId);
    throw new PlanPersistError(exercisesError.message);
  }

  return planId;
}

/**
 * Generate via OpenRouter, validate, then insert plan + exercises.
 * On exercise insert failure, deletes the plan row (no partial save).
 */
export async function generateAndPersistPlan(
  supabase: SupabaseClient,
  userId: string,
  goal: TrainingGoal,
): Promise<string> {
  if (!isPlanGenerationAvailable()) {
    throw new PlanGenerationError("Plan generation is not configured");
  }

  const payload = await generatePlanFromGoal(goal);
  return persistGeneratedPlan(supabase, userId, goal, payload);
}

export type { ValidatedPlanPayload };
