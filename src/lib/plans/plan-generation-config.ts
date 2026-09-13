import { GEMINI_API_KEY, PLAN_GENERATION_MOCK } from "astro:env/server";

/** Local dev only — set in `.dev.vars`, never in production Worker secrets. */
export function isPlanGenerationMockEnabled(): boolean {
  if (import.meta.env.PROD) {
    return false;
  }
  if (!PLAN_GENERATION_MOCK) {
    return false;
  }
  const normalized = PLAN_GENERATION_MOCK.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

export function isPlanGenerationAvailable(): boolean {
  return isPlanGenerationMockEnabled() || Boolean(GEMINI_API_KEY);
}
