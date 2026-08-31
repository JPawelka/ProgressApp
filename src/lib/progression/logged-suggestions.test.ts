import { expect, test } from "vitest";
import { buildLoggedSuggestions, coerceSessionSet } from "./logged-suggestions";

// Archive Phase 1: increase = heaviest + 2.5 kg; deload = heaviest × 0.9
const INCREASE_KG = 2.5;

const squat = { id: "squat", name: "Squat", default_reps: 5 };
const bench = { id: "bench", name: "Bench", default_reps: 8 };

test("coerceSessionSet turns string reps and load into finite numbers", () => {
  expect(coerceSessionSet({ plan_exercise_id: squat.id, reps: "5", load_kg: "100" })).toEqual({
    plan_exercise_id: squat.id,
    reps: 5,
    load_kg: 100,
  });
});

test("coerceSessionSet drops null or non-finite values", () => {
  expect(coerceSessionSet({ plan_exercise_id: squat.id, reps: 5, load_kg: null })).toBeNull();
  expect(coerceSessionSet({ plan_exercise_id: squat.id, reps: "nope", load_kg: 100 })).toBeNull();
  expect(coerceSessionSet({ plan_exercise_id: squat.id, reps: 5, load_kg: Number.NaN })).toBeNull();
});

test("string load and reps produce an increase from the locked rule", () => {
  expect(buildLoggedSuggestions([squat], [{ plan_exercise_id: squat.id, reps: "5", load_kg: "100" }])).toEqual([
    {
      plan_exercise_id: squat.id,
      name: "Squat",
      decision: "increase",
      suggested_load_kg: 100 + INCREASE_KG,
      heaviest_load_kg: 100,
    },
  ]);
});

test("exercises with only un-coercible sets are omitted", () => {
  expect(buildLoggedSuggestions([squat], [{ plan_exercise_id: squat.id, reps: 5, load_kg: "not-a-number" }])).toEqual(
    [],
  );
});

test("exercises with zero session sets are omitted", () => {
  expect(buildLoggedSuggestions([squat, bench], [{ plan_exercise_id: squat.id, reps: 5, load_kg: 100 }])).toEqual([
    {
      plan_exercise_id: squat.id,
      name: "Squat",
      decision: "increase",
      suggested_load_kg: 100 + INCREASE_KG,
      heaviest_load_kg: 100,
    },
  ]);
});
