import { expect, test } from "vitest";
import { exerciseWriteSchema, patchPlanSchema } from "./plan-edit-schema";

test("patchPlanSchema accepts a name within 100 characters", () => {
  const parsed = patchPlanSchema.safeParse({ name: "My plan" });
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data.name).toBe("My plan");
  }
});

test("patchPlanSchema turns a blank name into null", () => {
  const parsed = patchPlanSchema.safeParse({ name: "  " });
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data.name).toBeNull();
  }
});

test("patchPlanSchema rejects a name longer than 100 characters", () => {
  expect(patchPlanSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
});

test("patchPlanSchema rejects extra keys", () => {
  expect(patchPlanSchema.safeParse({ name: "My plan", extra: true }).success).toBe(false);
});

test("exerciseWriteSchema accepts in-range fields and nulls", () => {
  expect(
    exerciseWriteSchema.safeParse({
      name: "Squat",
      default_reps: 5,
      default_load_kg: 100,
    }).success,
  ).toBe(true);
  expect(
    exerciseWriteSchema.safeParse({
      name: "Squat",
      default_reps: null,
      default_load_kg: null,
    }).success,
  ).toBe(true);
});

test("exerciseWriteSchema rejects empty name and out-of-range reps or load", () => {
  expect(
    exerciseWriteSchema.safeParse({
      name: "  ",
      default_reps: 5,
      default_load_kg: 100,
    }).success,
  ).toBe(false);
  expect(
    exerciseWriteSchema.safeParse({
      name: "Squat",
      default_reps: 0,
      default_load_kg: 100,
    }).success,
  ).toBe(false);
  expect(
    exerciseWriteSchema.safeParse({
      name: "Squat",
      default_reps: 101,
      default_load_kg: 100,
    }).success,
  ).toBe(false);
  expect(
    exerciseWriteSchema.safeParse({
      name: "Squat",
      default_reps: 5,
      default_load_kg: -0.01,
    }).success,
  ).toBe(false);
  expect(
    exerciseWriteSchema.safeParse({
      name: "Squat",
      default_reps: 5,
      default_load_kg: 10000,
    }).success,
  ).toBe(false);
});

test("exerciseWriteSchema rejects extra keys", () => {
  expect(
    exerciseWriteSchema.safeParse({
      name: "Squat",
      default_reps: 5,
      default_load_kg: 100,
      extra: true,
    }).success,
  ).toBe(false);
});
