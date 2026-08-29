import type { APIRoute } from "astro";
import { exerciseWriteSchema, formatPlanEditRequestError } from "@/lib/plans/plan-edit-schema";
import { isAuthFailure, json, parseJsonBody, requirePlanApiAuth } from "@/lib/plans/plan-api";
import { deleteExercise, planEditFailure, updateExercise } from "@/lib/services/plan-edit";

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
  const auth = await requirePlanApiAuth(context);
  if (isAuthFailure(auth)) {
    return auth;
  }

  const planId = context.params.id;
  const exerciseId = context.params.exerciseId;
  if (!planId || !exerciseId) {
    return json({ error: "Not found" }, 404);
  }

  const body = await parseJsonBody(context.request);
  if (!body.ok) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = exerciseWriteSchema.safeParse(body.data);
  if (!parsed.success) {
    return json({ error: "Invalid request", details: formatPlanEditRequestError(parsed.error) }, 400);
  }

  try {
    const exercise = await updateExercise(auth.supabase, auth.user.id, planId, exerciseId, parsed.data);
    return json({ exercise }, 200);
  } catch (error) {
    const mapped = planEditFailure(error);
    if (mapped) {
      return json({ error: mapped.error }, mapped.status);
    }
    return json({ error: "Failed to update exercise" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requirePlanApiAuth(context);
  if (isAuthFailure(auth)) {
    return auth;
  }

  const planId = context.params.id;
  const exerciseId = context.params.exerciseId;
  if (!planId || !exerciseId) {
    return json({ error: "Not found" }, 404);
  }

  try {
    await deleteExercise(auth.supabase, auth.user.id, planId, exerciseId);
    return json({ ok: true }, 200);
  } catch (error) {
    const mapped = planEditFailure(error);
    if (mapped) {
      return json({ error: mapped.error }, mapped.status);
    }
    return json({ error: "Failed to delete exercise" }, 500);
  }
};
