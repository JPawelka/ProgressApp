export function planIdFromGenerateResponse(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const planId = (data as { planId?: unknown }).planId;
  return typeof planId === "string" && planId.length > 0 ? planId : null;
}
