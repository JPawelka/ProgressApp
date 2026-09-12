import { expect, test } from "vitest";
import {
  ProgressionApplyNotFoundError,
  ProgressionApplyPersistError,
  ProgressionApplyValidationError,
  progressionApplyFailure,
} from "./progression-apply";

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
