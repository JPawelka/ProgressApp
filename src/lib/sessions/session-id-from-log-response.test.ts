import { expect, test } from "vitest";
import { sessionIdFromLogResponse } from "./session-id-from-log-response";

test("returns a non-empty session.id string", () => {
  expect(sessionIdFromLogResponse({ session: { id: "uuid-string" } })).toBe("uuid-string");
});

test("returns null when session.id is missing empty or not a string", () => {
  expect(sessionIdFromLogResponse({})).toBeNull();
  expect(sessionIdFromLogResponse({ session: {} })).toBeNull();
  expect(sessionIdFromLogResponse({ session: { id: "" } })).toBeNull();
  expect(sessionIdFromLogResponse({ session: { id: 1 } })).toBeNull();
  expect(sessionIdFromLogResponse(null)).toBeNull();
});
