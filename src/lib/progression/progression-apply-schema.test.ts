import { expect, test } from "vitest";
import { applyProgressionSchema } from "./progression-apply-schema";

const squatId = "550e8400-e29b-41d4-a716-446655440000";
const benchId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

test("accepts a unique in-range load list", () => {
  const parsed = applyProgressionSchema.safeParse({
    loads: [{ plan_exercise_id: squatId, load_kg: 102.5 }],
  });
  expect(parsed.success).toBe(true);
});

test("rejects empty loads", () => {
  expect(applyProgressionSchema.safeParse({ loads: [] }).success).toBe(false);
});

test("rejects duplicate plan_exercise_id", () => {
  expect(
    applyProgressionSchema.safeParse({
      loads: [
        { plan_exercise_id: squatId, load_kg: 100 },
        { plan_exercise_id: squatId, load_kg: 110 },
      ],
    }).success,
  ).toBe(false);
});

test("rejects load_kg outside 0 to 9999.99", () => {
  expect(
    applyProgressionSchema.safeParse({
      loads: [{ plan_exercise_id: squatId, load_kg: -1 }],
    }).success,
  ).toBe(false);
  expect(
    applyProgressionSchema.safeParse({
      loads: [{ plan_exercise_id: squatId, load_kg: 10000 }],
    }).success,
  ).toBe(false);
});

test("rejects extra keys", () => {
  expect(
    applyProgressionSchema.safeParse({
      loads: [{ plan_exercise_id: squatId, load_kg: 100, extra: true }],
    }).success,
  ).toBe(false);
  expect(
    applyProgressionSchema.safeParse({
      loads: [{ plan_exercise_id: benchId, load_kg: 80 }],
      extra: true,
    }).success,
  ).toBe(false);
});
