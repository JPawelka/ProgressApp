export function errorMessageFromBody(data: unknown, fallback: string): string {
  if (typeof data !== "object" || data === null) {
    return fallback;
  }

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : fallback;
}
