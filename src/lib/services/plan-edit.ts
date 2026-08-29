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

async function requireOwnedPlan(supabase: SupabaseClient, planId: string): Promise<void> {
  const { data, error } = (await supabase.from("plans").select("id").eq("id", planId).maybeSingle()) as RowResult<{
    id: string;
  }>;

  if (error) {
    throw new PlanEditPersistError(error.message);
  }
  if (!data) {
    throw new PlanEditNotFoundError();
  }
}

async function countPlanExercises(supabase: SupabaseClient, planId: string): Promise<number> {
  const { count, error } = (await supabase
    .from("plan_exercises")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId)) as RowResult<unknown>;

  if (error || count === null || count === undefined) {
    throw new PlanEditPersistError(error?.message ?? "Failed to count exercises");
  }

  return count;
}

export function planEditFailure(error: unknown): { error: string; status: number } | null {
  if (error instanceof PlanEditNotFoundError) {
    return { error: error.message, status: 404 };
  }
  if (error instanceof PlanEditCardinalityError) {
    return { error: error.message, status: 409 };
  }
  if (error instanceof PlanEditPersistError) {
    return { error: error.message, status: 500 };
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
  userId: string,
  planId: string,
  input: ExerciseWriteInput,
): Promise<PlanExercise> {
  await requireOwnedPlan(supabase, planId);

  const count = await countPlanExercises(supabase, planId);
  if (count >= MAX_PLAN_EXERCISES) {
    throw new PlanEditCardinalityError("Plan cannot have more than 8 exercises");
  }

  const { data: lastRows, error: lastError } = (await supabase
    .from("plan_exercises")
    .select("sort_order")
    .eq("plan_id", planId)
    .order("sort_order", { ascending: false })
    .limit(1)) as RowResult<{ sort_order: number }[]>;

  if (lastError) {
    throw new PlanEditPersistError(lastError.message);
  }

  const lastSort = lastRows?.[0]?.sort_order;
  const sortOrder = lastSort === undefined ? 0 : lastSort + 1;

  const { data, error } = (await supabase
    .from("plan_exercises")
    .insert({
      user_id: userId,
      plan_id: planId,
      sort_order: sortOrder,
      ...exerciseRowFromInput(input),
    })
    .select("*")
    .single()) as RowResult<PlanExercise>;

  if (error || !data) {
    throw new PlanEditPersistError(error?.message ?? "Failed to add exercise");
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
  userId: string,
  planId: string,
  exerciseId: string,
): Promise<void> {
  const { data: existing, error: existingError } = (await supabase
    .from("plan_exercises")
    .select("id")
    .eq("id", exerciseId)
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .maybeSingle()) as RowResult<{ id: string }>;

  if (existingError) {
    throw new PlanEditPersistError(existingError.message);
  }
  if (!existing) {
    throw new PlanEditNotFoundError();
  }

  const count = await countPlanExercises(supabase, planId);
  if (count <= MIN_PLAN_EXERCISES) {
    throw new PlanEditCardinalityError("Plan must have at least one exercise");
  }

  const { data, error } = (await supabase
    .from("plan_exercises")
    .delete()
    .eq("id", exerciseId)
    .eq("plan_id", planId)
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
