import { expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ProgressionApplyNotFoundError,
  ProgressionApplyPersistError,
  ProgressionApplyValidationError,
  applyProgressionLoads,
  progressionApplyFailure,
} from "./progression-apply";

const sessionId = "session-a";
const loads = [{ plan_exercise_id: "550e8400-e29b-41d4-a716-446655440000", load_kg: 102.5 }];

function createFakeRpcClient(message: string) {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return Promise.resolve({ error: { message } });
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

test("maps not-found to 404 Not found", () => {
  expect(progressionApplyFailure(new ProgressionApplyNotFoundError())).toEqual({
    error: "Not found",
    status: 404,
  });
});

test("maps validation to 400 Invalid request", () => {
  expect(progressionApplyFailure(new ProgressionApplyValidationError("Invalid request"))).toEqual({
    error: "Invalid request",
    status: 400,
  });
});

test("maps missing RPC to 503 with the setup message", () => {
  expect(
    progressionApplyFailure(new ProgressionApplyPersistError("Progression is not set up on the database")),
  ).toEqual({
    error: "Progression is not set up on the database",
    status: 503,
  });
});

test("maps other persist failures to 500 Failed to save progression", () => {
  expect(progressionApplyFailure(new ProgressionApplyPersistError("duplicate key"))).toEqual({
    error: "Failed to save progression",
    status: 500,
  });
});

test("returns null for unknown errors", () => {
  expect(progressionApplyFailure(new Error("boom"))).toBeNull();
});

test("applyProgressionLoads maps rpc Not found to ProgressionApplyNotFoundError and 404", async () => {
  const { client, calls } = createFakeRpcClient("Not found");
  const error = await applyProgressionLoads(client, sessionId, loads).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ProgressionApplyNotFoundError);
  expect(calls).toEqual([{ name: "apply_progression_loads", args: { p_session_id: sessionId, p_loads: loads } }]);
  expect(progressionApplyFailure(error)).toEqual({ error: "Not found", status: 404 });
});

test("applyProgressionLoads maps rpc Invalid loads to 400 Invalid request", async () => {
  const { client } = createFakeRpcClient("Invalid loads");
  const error = await applyProgressionLoads(client, sessionId, loads).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ProgressionApplyValidationError);
  expect(progressionApplyFailure(error)).toEqual({ error: "Invalid request", status: 400 });
});
