import type { APIContext } from "astro";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function parseJsonBody(request: Request): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return { ok: false };
  }
}

export async function requirePlanApiAuth(
  context: APIContext,
): Promise<{ supabase: SupabaseClient; user: User } | Response> {
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

  return { supabase, user };
}

export function isAuthFailure(value: { supabase: SupabaseClient; user: User } | Response): value is Response {
  return value instanceof Response;
}
