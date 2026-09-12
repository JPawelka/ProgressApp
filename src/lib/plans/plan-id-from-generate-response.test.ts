import { expect, test } from "vitest";
import { planIdFromGenerateResponse } from "./plan-id-from-generate-response";

test("returns a non-empty planId string", () => {
  expect(planIdFromGenerateResponse({ planId: "uuid-string" })).toBe("uuid-string");
});

test("returns null when planId is missing empty or not a string", () => {
  expect(planIdFromGenerateResponse({})).toBeNull();
  expect(planIdFromGenerateResponse({ planId: "" })).toBeNull();
  expect(planIdFromGenerateResponse({ planId: 1 })).toBeNull();
  expect(planIdFromGenerateResponse(null)).toBeNull();
});
