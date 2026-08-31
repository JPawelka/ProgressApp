export function sessionIdFromLogResponse(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const session = (data as { session?: unknown }).session;
  if (typeof session !== "object" || session === null) {
    return null;
  }

  const id = (session as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
