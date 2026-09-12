import { expect, test } from "vitest";
import {
  SessionLogNotFoundError,
  SessionLogPersistError,
  SessionLogValidationError,
  sessionLogFailure,
} from "./session-log";

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
