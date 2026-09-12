import { expect, test } from "vitest";
import { errorMessageFromBody } from "./error-message-from-body";

test("returns a non-empty error string", () => {
  expect(errorMessageFromBody({ error: "Invalid request" }, "Request failed")).toBe("Invalid request");
});

test("returns the fallback when error is missing empty or not a string", () => {
  expect(errorMessageFromBody({}, "Request failed")).toBe("Request failed");
  expect(errorMessageFromBody({ error: "" }, "Request failed")).toBe("Request failed");
  expect(errorMessageFromBody({ error: 1 }, "Request failed")).toBe("Request failed");
  expect(errorMessageFromBody(null, "Request failed")).toBe("Request failed");
});
