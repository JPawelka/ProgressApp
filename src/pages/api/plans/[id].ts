import type { APIRoute } from "astro";
import { formatPlanEditRequestError, patchPlanSchema } from "@/lib/plans/plan-edit-schema";
import { isAuthFailure, json, parseJsonBody, requirePlanApiAuth } from "@/lib/plans/plan-api";
import { deletePlan, planEditFailure, updatePlanName } from "@/lib/services/plan-edit";

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
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

  const parsed = patchPlanSchema.safeParse(body.data);
  if (!parsed.success) {
    return json({ error: "Invalid request", details: formatPlanEditRequestError(parsed.error) }, 400);
  }

  try {
    const plan = await updatePlanName(auth.supabase, auth.user.id, planId, parsed.data.name);
    return json({ plan }, 200);
  } catch (error) {
    const mapped = planEditFailure(error);
    if (mapped) {
      return json({ error: mapped.error }, mapped.status);
    }
    return json({ error: "Failed to update plan" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requirePlanApiAuth(context);
  if (isAuthFailure(auth)) {
    return auth;
  }

  const planId = context.params.id;
  if (!planId) {
    return json({ error: "Not found" }, 404);
  }

  try {
    await deletePlan(auth.supabase, auth.user.id, planId);
    return json({ ok: true }, 200);
  } catch (error) {
    const mapped = planEditFailure(error);
    if (mapped) {
      return json({ error: mapped.error }, mapped.status);
    }
    return json({ error: "Failed to delete plan" }, 500);
  }
};
