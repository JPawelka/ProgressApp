import { expect, test } from "vitest";
import { generatePlanRequestSchema } from "./plan-generation-schema";

test("accepts a training goal enum value", () => {
  expect(generatePlanRequestSchema.safeParse({ goal: "strength" }).success).toBe(true);
});

test("rejects missing goal", () => {
  expect(generatePlanRequestSchema.safeParse({}).success).toBe(false);
});

test("rejects a goal that is not mass strength or endurance", () => {
  expect(generatePlanRequestSchema.safeParse({ goal: "hypertrophy" }).success).toBe(false);
});
