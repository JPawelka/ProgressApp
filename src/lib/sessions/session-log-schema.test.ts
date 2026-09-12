import { expect, test } from "vitest";
import { logSessionSchema } from "./session-log-schema";

const squatId = "550e8400-e29b-41d4-a716-446655440000";
const benchId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

test("accepts a unique in-range complete set list", () => {
  const parsed = logSessionSchema.safeParse({
    sets: [{ plan_exercise_id: squatId, set_number: 1, reps: 5, load_kg: 100 }],
  });
  expect(parsed.success).toBe(true);
});

test("rejects empty sets", () => {
  expect(logSessionSchema.safeParse({ sets: [] }).success).toBe(false);
});

test("rejects missing or null reps and load", () => {
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 1, load_kg: 100 }],
    }).success,
  ).toBe(false);
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 1, reps: 5 }],
    }).success,
  ).toBe(false);
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 1, reps: null, load_kg: 100 }],
    }).success,
  ).toBe(false);
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 1, reps: 5, load_kg: null }],
    }).success,
  ).toBe(false);
});

test("rejects reps load and set_number outside archive ranges", () => {
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 1, reps: 0, load_kg: 100 }],
    }).success,
  ).toBe(false);
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 1, reps: 101, load_kg: 100 }],
    }).success,
  ).toBe(false);
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 1, reps: 5, load_kg: -0.01 }],
    }).success,
  ).toBe(false);
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 1, reps: 5, load_kg: 10000 }],
    }).success,
  ).toBe(false);
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 0, reps: 5, load_kg: 100 }],
    }).success,
  ).toBe(false);
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 9, reps: 5, load_kg: 100 }],
    }).success,
  ).toBe(false);
});

test("rejects duplicate plan_exercise_id and set_number", () => {
  expect(
    logSessionSchema.safeParse({
      sets: [
        { plan_exercise_id: squatId, set_number: 1, reps: 5, load_kg: 100 },
        { plan_exercise_id: squatId, set_number: 1, reps: 6, load_kg: 110 },
      ],
    }).success,
  ).toBe(false);
});

test("well-formed foreign UUID still parses (shape, not lineage/attach)", () => {
  const parsed = logSessionSchema.safeParse({
    sets: [{ plan_exercise_id: benchId, set_number: 1, reps: 8, load_kg: 80 }],
  });
  expect(parsed.success).toBe(true);
});

test("rejects extra keys", () => {
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: squatId, set_number: 1, reps: 5, load_kg: 100, extra: true }],
    }).success,
  ).toBe(false);
  expect(
    logSessionSchema.safeParse({
      sets: [{ plan_exercise_id: benchId, set_number: 1, reps: 8, load_kg: 80 }],
      extra: true,
    }).success,
  ).toBe(false);
});
