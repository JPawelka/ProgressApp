import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isPlanGenerationAvailable } from "@/lib/plans/plan-generation-config";
import { GeminiError } from "@/lib/plans/gemini";
import { formatGeneratePlanRequestError, generatePlanRequestSchema } from "@/lib/plans/plan-generation-schema";
import { generateAndPersistPlan, PlanGenerationError, planPersistFailure } from "@/lib/services/plan-generation";

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 503);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!isPlanGenerationAvailable()) {
    return json({ error: "Plan generation is unavailable — Gemini is not configured" }, 503);
  }

  let rawBody: unknown;
  try {
    rawBody = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = generatePlanRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: "Invalid request", details: formatGeneratePlanRequestError(parsed.error) }, 400);
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount, error: rateError } = await supabase
    .from("plans")
    .select("id", { count: "exact", head: true })
    .gte("created_at", oneMinuteAgo);

  if (!rateError && recentCount !== null && recentCount >= 5) {
    return json({ error: "Too many plan generations. Please wait a moment." }, 429);
  }

  try {
    const planId = await generateAndPersistPlan(supabase, user.id, parsed.data.goal);
    return json({ planId }, 200);
  } catch (error) {
    if (error instanceof PlanGenerationError || error instanceof GeminiError) {
      return json({ error: error.message }, 502);
    }
    const persist = planPersistFailure(error);
    if (persist) {
      return json({ error: persist.error }, persist.status);
    }
    return json({ error: "Failed to generate plan" }, 500);
  }
};
