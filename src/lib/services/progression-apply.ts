import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProgressionLoadWriteInput } from "@/lib/progression/progression-apply-schema";

export class ProgressionApplyNotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "ProgressionApplyNotFoundError";
  }
}

export class ProgressionApplyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgressionApplyValidationError";
  }
}

export class ProgressionApplyPersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgressionApplyPersistError";
  }
}

function throwFromRpcMessage(message: string | undefined): never {
  const text = message ?? "Request failed";
  if (text.includes("Not found")) {
    throw new ProgressionApplyNotFoundError();
  }
  if (text.includes("Empty loads") || text.includes("Invalid loads")) {
    throw new ProgressionApplyValidationError("Invalid request");
  }
  if (text.includes("Could not find the function") || text.includes("schema cache")) {
    throw new ProgressionApplyPersistError(
      "Progression is not set up on the database. Run supabase/migrations/20260830221000_apply_progression_loads_rpc.sql in the SQL Editor.",
    );
  }
  throw new ProgressionApplyPersistError(text);
}

export function progressionApplyFailure(error: unknown): { error: string; status: number } | null {
  if (error instanceof ProgressionApplyNotFoundError) {
    return { error: error.message, status: 404 };
  }
  if (error instanceof ProgressionApplyValidationError) {
    return { error: error.message, status: 400 };
  }
  if (error instanceof ProgressionApplyPersistError) {
    console.error("Progression apply persist failed", error.message);
    if (error.message.startsWith("Progression is not set up")) {
      return { error: error.message, status: 503 };
    }
    return { error: "Failed to save progression", status: 500 };
  }
  return null;
}

export async function applyProgressionLoads(
  supabase: SupabaseClient,
  sessionId: string,
  loads: ProgressionLoadWriteInput[],
): Promise<void> {
  const { error } = await supabase.rpc("apply_progression_loads", {
    p_session_id: sessionId,
    p_loads: loads,
  });

  if (error) {
    throwFromRpcMessage(error.message);
  }
}
