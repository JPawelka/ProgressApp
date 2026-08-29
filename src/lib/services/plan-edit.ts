import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan, PlanExercise } from "@/types";
import type { ExerciseWriteInput } from "@/lib/plans/plan-edit-schema";

export const MIN_PLAN_EXERCISES = 1;
export const MAX_PLAN_EXERCISES = 8;

export class PlanEditNotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "PlanEditNotFoundError";
  }
}

export class PlanEditCardinalityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanEditCardinalityError";
  }
}

export class PlanEditPersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanEditPersistError";
  }
}

function toLoadKg(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  return value.toFixed(2);
}

/** Untyped Supabase client collapses results; narrow at the boundary. */
interface RowResult<T> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

function exerciseRowFromInput(input: ExerciseWriteInput) {
  return {
    name: input.name,
    default_reps: input.default_reps,
    default_load_kg: toLoadKg(input.default_load_kg),
  };
}

function throwFromRpcMessage(message: string | undefined): never {
  const text = message ?? "Request failed";
  if (text.includes("more than 8 exercises")) {
    throw new PlanEditCardinalityError("Plan cannot have more than 8 exercises");
  }
  if (text.includes("at least one exercise")) {
    throw new PlanEditCardinalityError("Plan must have at least one exercise");
  }
  if (text.includes("Not found")) {
    throw new PlanEditNotFoundError();
  }
  throw new PlanEditPersistError(text);
}

export function planEditFailure(error: unknown): { error: string; status: number } | null {
  if (error instanceof PlanEditNotFoundError) {
    return { error: error.message, status: 404 };
  }
  if (error instanceof PlanEditCardinalityError) {
    return { error: error.message, status: 409 };
  }
  if (error instanceof PlanEditPersistError) {
    console.error("Plan edit persist failed", error.message);
    return { error: "Failed to save plan", status: 500 };
  }
  return null;
}

export async function updatePlanName(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
  name: string | null,
): Promise<Plan> {
  const { data, error } = (await supabase
    .from("plans")
    .update({ name })
    .eq("id", planId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle()) as RowResult<Plan>;

  if (error) {
    throw new PlanEditPersistError(error.message);
  }
  if (!data) {
    throw new PlanEditNotFoundError();
  }

  return data;
}

export async function deletePlan(supabase: SupabaseClient, userId: string, planId: string): Promise<void> {
  const { data, error } = (await supabase
    .from("plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle()) as RowResult<{ id: string }>;

  if (error) {
    throw new PlanEditPersistError(error.message);
  }
  if (!data) {
    throw new PlanEditNotFoundError();
  }
}

export async function addExercise(
  supabase: SupabaseClient,
  _userId: string,
  planId: string,
  input: ExerciseWriteInput,
): Promise<PlanExercise> {
  const { data, error } = (await supabase.rpc("add_plan_exercise", {
    p_plan_id: planId,
    p_name: input.name,
    p_default_reps: input.default_reps,
    p_default_load_kg: input.default_load_kg,
  })) as RowResult<PlanExercise>;

  if (error || !data) {
    throwFromRpcMessage(error?.message);
  }

  return data;
}

export async function updateExercise(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
  exerciseId: string,
  input: ExerciseWriteInput,
): Promise<PlanExercise> {
  const { data, error } = (await supabase
    .from("plan_exercises")
    .update(exerciseRowFromInput(input))
    .eq("id", exerciseId)
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle()) as RowResult<PlanExercise>;

  if (error) {
    throw new PlanEditPersistError(error.message);
  }
  if (!data) {
    throw new PlanEditNotFoundError();
  }

  return data;
}

export async function deleteExercise(
  supabase: SupabaseClient,
  _userId: string,
  planId: string,
  exerciseId: string,
): Promise<void> {
  const { error } = await supabase.rpc("delete_plan_exercise", {
    p_plan_id: planId,
    p_exercise_id: exerciseId,
  });

  if (error) {
    throwFromRpcMessage(error.message);
  }
}
