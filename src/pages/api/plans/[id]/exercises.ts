import type { APIRoute } from "astro";
import { exerciseWriteSchema, formatPlanEditRequestError } from "@/lib/plans/plan-edit-schema";
import { isAuthFailure, json, parseJsonBody, requirePlanApiAuth } from "@/lib/plans/plan-api";
import { addExercise, planEditFailure } from "@/lib/services/plan-edit";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requirePlanApiAuth(context);
  if (isAuthFailure(auth)) {
    return auth;
  }

  const planId = context.params.id;
  if (!planId) {
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
    const exercise = await addExercise(auth.supabase, auth.user.id, planId, parsed.data);
    return json({ exercise }, 201);
  } catch (error) {
    const mapped = planEditFailure(error);
    if (mapped) {
      return json({ error: mapped.error }, mapped.status);
    }
    return json({ error: "Failed to add exercise" }, 500);
  }
};
