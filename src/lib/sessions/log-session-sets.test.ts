import { expect, test } from "vitest";
import {
  EMPTY_LOG_SETS_ERROR,
  MAX_SETS_PER_EXERCISE,
  MAX_SETS_PER_EXERCISE_ERROR,
  buildLogSessionSets,
} from "./log-session-sets";

const squatId = "550e8400-e29b-41d4-a716-446655440000";
const benchId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

test("omits blank drafts and renumbers complete sets", () => {
  const result = buildLogSessionSets([{ id: squatId }], {
    [squatId]: [
      { reps: "5", load: "100" },
      { reps: "", load: "" },
      { reps: "6", load: "102.5" },
    ],
  });
  expect(result).toEqual({
    ok: true,
    sets: [
      { plan_exercise_id: squatId, set_number: 1, reps: 5, load_kg: 100 },
      { plan_exercise_id: squatId, set_number: 2, reps: 6, load_kg: 102.5 },
    ],
  });
});

test("omits invalid filled drafts the same as blanks", () => {
  const result = buildLogSessionSets([{ id: squatId }], {
    [squatId]: [
      { reps: "0", load: "100" },
      { reps: "5", load: "10000" },
      { reps: "5", load: "80" },
    ],
  });
  expect(result).toEqual({
    ok: true,
    sets: [{ plan_exercise_id: squatId, set_number: 1, reps: 5, load_kg: 80 }],
  });
});

test("skipped exercise contributes no rows", () => {
  const result = buildLogSessionSets([{ id: squatId }, { id: benchId }], {
    [squatId]: [{ reps: "5", load: "100" }],
    [benchId]: [
      { reps: "", load: "" },
      { reps: "", load: "" },
    ],
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.sets).toEqual([{ plan_exercise_id: squatId, set_number: 1, reps: 5, load_kg: 100 }]);
  }
});

test("all blank drafts are not a session", () => {
  expect(buildLogSessionSets([{ id: squatId }], { [squatId]: [{ reps: "", load: "" }] })).toEqual({
    ok: false,
    error: EMPTY_LOG_SETS_ERROR,
  });
});

test("more than eight complete sets per exercise is rejected", () => {
  const drafts = Array.from({ length: MAX_SETS_PER_EXERCISE + 1 }, () => ({ reps: "5", load: "100" }));
  expect(buildLogSessionSets([{ id: squatId }], { [squatId]: drafts })).toEqual({
    ok: false,
    error: MAX_SETS_PER_EXERCISE_ERROR,
  });
});
