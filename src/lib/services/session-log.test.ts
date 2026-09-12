import { expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SessionLogNotFoundError,
  SessionLogPersistError,
  SessionLogValidationError,
  logSession,
  sessionLogFailure,
} from "./session-log";

const planId = "plan-a";
const sets = [
  {
    plan_exercise_id: "550e8400-e29b-41d4-a716-446655440000",
    set_number: 1,
    reps: 5,
    load_kg: 100,
  },
];

function createFakeRpcClient(message: string) {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return Promise.resolve({ data: null, error: { message } });
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

test("maps not-found to 404 Not found", () => {
  expect(sessionLogFailure(new SessionLogNotFoundError())).toEqual({
    error: "Not found",
    status: 404,
  });
});

test("maps validation to 400 Invalid request", () => {
  expect(sessionLogFailure(new SessionLogValidationError("Invalid request"))).toEqual({
    error: "Invalid request",
    status: 400,
  });
});

test("maps persist to 500 Failed to save session without leaking RPC text", () => {
  expect(sessionLogFailure(new SessionLogPersistError("duplicate key value"))).toEqual({
    error: "Failed to save session",
    status: 500,
  });
});

test("returns null for unknown errors", () => {
  expect(sessionLogFailure(new Error("boom"))).toBeNull();
  expect(sessionLogFailure("string")).toBeNull();
});

test("logSession maps rpc Not found to SessionLogNotFoundError and 404", async () => {
  const { client, calls } = createFakeRpcClient("Not found");
  const error = await logSession(client, "user-a", planId, sets).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(SessionLogNotFoundError);
  expect(calls).toEqual([{ name: "log_training_session", args: { p_plan_id: planId, p_sets: sets } }]);
  expect(sessionLogFailure(error)).toEqual({ error: "Not found", status: 404 });
});

test("logSession maps rpc Invalid sets to 400 Invalid request", async () => {
  const { client } = createFakeRpcClient("Invalid sets");
  const error = await logSession(client, "user-a", planId, sets).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(SessionLogValidationError);
  expect(sessionLogFailure(error)).toEqual({ error: "Invalid request", status: 400 });
});
