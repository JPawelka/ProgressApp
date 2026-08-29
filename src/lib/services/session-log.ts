import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@/types";
import type { SessionSetWriteInput } from "@/lib/sessions/session-log-schema";

export class SessionLogNotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "SessionLogNotFoundError";
  }
}

export class SessionLogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionLogValidationError";
  }
}

export class SessionLogPersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionLogPersistError";
  }
}

interface RowResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function throwFromRpcMessage(message: string | undefined): never {
  const text = message ?? "Request failed";
  if (text.includes("Not found")) {
    throw new SessionLogNotFoundError();
  }
  if (text.includes("Empty sets") || text.includes("Invalid sets")) {
    throw new SessionLogValidationError("Invalid request");
  }
  throw new SessionLogPersistError(text);
}

export function sessionLogFailure(error: unknown): { error: string; status: number } | null {
  if (error instanceof SessionLogNotFoundError) {
    return { error: error.message, status: 404 };
  }
  if (error instanceof SessionLogValidationError) {
    return { error: error.message, status: 400 };
  }
  if (error instanceof SessionLogPersistError) {
    console.error("Session log persist failed", error.message);
    return { error: "Failed to save session", status: 500 };
  }
  return null;
}

export async function logSession(
  supabase: SupabaseClient,
  _userId: string,
  planId: string,
  sets: SessionSetWriteInput[],
): Promise<Session> {
  const { data, error } = (await supabase.rpc("log_training_session", {
    p_plan_id: planId,
    p_sets: sets,
  })) as RowResult<Session>;

  if (error || !data) {
    throwFromRpcMessage(error?.message);
  }

  return data;
}
