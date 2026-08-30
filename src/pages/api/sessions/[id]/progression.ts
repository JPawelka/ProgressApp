import type { APIRoute } from "astro";
import { applyProgressionSchema, formatApplyProgressionRequestError } from "@/lib/progression/progression-apply-schema";
import { isAuthFailure, json, parseJsonBody, requirePlanApiAuth } from "@/lib/plans/plan-api";
import { applyProgressionLoads, progressionApplyFailure } from "@/lib/services/progression-apply";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requirePlanApiAuth(context);
  if (isAuthFailure(auth)) {
    return auth;
  }

  const sessionId = context.params.id;
  if (!sessionId) {
    return json({ error: "Not found" }, 404);
  }

  const body = await parseJsonBody(context.request);
  if (!body.ok) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = applyProgressionSchema.safeParse(body.data);
  if (!parsed.success) {
    return json({ error: "Invalid request", details: formatApplyProgressionRequestError(parsed.error) }, 400);
  }

  try {
    await applyProgressionLoads(auth.supabase, sessionId, parsed.data.loads);
    return json({ ok: true }, 200);
  } catch (error) {
    const mapped = progressionApplyFailure(error);
    if (mapped) {
      return json({ error: mapped.error }, mapped.status);
    }
    return json({ error: "Failed to save progression" }, 500);
  }
};
