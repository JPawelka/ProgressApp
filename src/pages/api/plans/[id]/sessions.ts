import type { APIRoute } from "astro";
import { formatLogSessionRequestError, logSessionSchema } from "@/lib/sessions/session-log-schema";
import { isAuthFailure, json, parseJsonBody, requirePlanApiAuth } from "@/lib/plans/plan-api";
import { logSession, sessionLogFailure } from "@/lib/services/session-log";

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

  const parsed = logSessionSchema.safeParse(body.data);
  if (!parsed.success) {
    return json({ error: "Invalid request", details: formatLogSessionRequestError(parsed.error) }, 400);
  }

  try {
    const session = await logSession(auth.supabase, auth.user.id, planId, parsed.data.sets);
    return json({ session }, 201);
  } catch (error) {
    const mapped = sessionLogFailure(error);
    if (mapped) {
      return json({ error: mapped.error }, mapped.status);
    }
    return json({ error: "Failed to save session" }, 500);
  }
};
