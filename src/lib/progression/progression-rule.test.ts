import { expect, test } from "vitest";
import { suggestProgression } from "./progression-rule";

// Archive Phase 1: increase = heaviest + 2.5 kg; deload = heaviest × 0.9
const INCREASE_KG = 2.5;
const DELOAD_FACTOR = 0.9;

const squat = { id: "squat", name: "Squat", default_reps: 5 };
const bench = { id: "bench", name: "Bench", default_reps: 8 };
const row = { id: "row", name: "Row", default_reps: 10 };
const curl = { id: "curl", name: "Curl", default_reps: null };

test("all sets hitting target increase from the heaviest load", () => {
  expect(
    suggestProgression(
      [squat],
      [
        { plan_exercise_id: "squat", reps: 5, load_kg: 100 },
        { plan_exercise_id: "squat", reps: 5, load_kg: 100 },
        { plan_exercise_id: "squat", reps: 6, load_kg: 100 },
      ],
    ),
  ).toEqual([
    {
      plan_exercise_id: "squat",
      name: "Squat",
      decision: "increase",
      suggested_load_kg: 100 + INCREASE_KG,
      heaviest_load_kg: 100,
    },
  ]);
});

test("all sets missing target deload from the heaviest load", () => {
  expect(
    suggestProgression(
      [bench],
      [
        { plan_exercise_id: "bench", reps: 6, load_kg: 80 },
        { plan_exercise_id: "bench", reps: 7, load_kg: 80 },
      ],
    ),
  ).toEqual([
    {
      plan_exercise_id: "bench",
      name: "Bench",
      decision: "deload",
      suggested_load_kg: 80 * DELOAD_FACTOR,
      heaviest_load_kg: 80,
    },
  ]);
});

test("mixed hit and miss holds at the heaviest load", () => {
  expect(
    suggestProgression(
      [squat],
      [
        { plan_exercise_id: "squat", reps: 5, load_kg: 100 },
        { plan_exercise_id: "squat", reps: 4, load_kg: 100 },
      ],
    ),
  ).toEqual([
    {
      plan_exercise_id: "squat",
      name: "Squat",
      decision: "hold",
      suggested_load_kg: 100,
      heaviest_load_kg: 100,
    },
  ]);
});

test("null default_reps holds at the heaviest logged load", () => {
  expect(
    suggestProgression(
      [curl],
      [
        { plan_exercise_id: "curl", reps: 12, load_kg: 20 },
        { plan_exercise_id: "curl", reps: 8, load_kg: 22.5 },
      ],
    ),
  ).toEqual([
    {
      plan_exercise_id: "curl",
      name: "Curl",
      decision: "hold",
      suggested_load_kg: 22.5,
      heaviest_load_kg: 22.5,
    },
  ]);
});

test("exercises with no sets are omitted and remaining keep input order", () => {
  expect(
    suggestProgression(
      [squat, bench, row],
      [
        { plan_exercise_id: "row", reps: 10, load_kg: 60 },
        { plan_exercise_id: "squat", reps: 5, load_kg: 100 },
      ],
    ),
  ).toEqual([
    {
      plan_exercise_id: "squat",
      name: "Squat",
      decision: "increase",
      suggested_load_kg: 100 + INCREASE_KG,
      heaviest_load_kg: 100,
    },
    {
      plan_exercise_id: "row",
      name: "Row",
      decision: "increase",
      suggested_load_kg: 60 + INCREASE_KG,
      heaviest_load_kg: 60,
    },
  ]);
});

test("mixed loads still increase from the heaviest when every set hits", () => {
  expect(
    suggestProgression(
      [squat],
      [
        { plan_exercise_id: "squat", reps: 5, load_kg: 80 },
        { plan_exercise_id: "squat", reps: 5, load_kg: 100 },
        { plan_exercise_id: "squat", reps: 6, load_kg: 90 },
      ],
    ),
  ).toEqual([
    {
      plan_exercise_id: "squat",
      name: "Squat",
      decision: "increase",
      suggested_load_kg: 100 + INCREASE_KG,
      heaviest_load_kg: 100,
    },
  ]);
});

test("increase clamps suggested load at 9999.99", () => {
  expect(suggestProgression([squat], [{ plan_exercise_id: "squat", reps: 5, load_kg: 9998 }])).toEqual([
    {
      plan_exercise_id: "squat",
      name: "Squat",
      decision: "increase",
      suggested_load_kg: 9999.99,
      heaviest_load_kg: 9998,
    },
  ]);
});

test("deload of 0 stays 0", () => {
  expect(suggestProgression([bench], [{ plan_exercise_id: "bench", reps: 1, load_kg: 0 }])).toEqual([
    {
      plan_exercise_id: "bench",
      name: "Bench",
      decision: "deload",
      suggested_load_kg: 0,
      heaviest_load_kg: 0,
    },
  ]);
});

test("deload rounds to two decimal places", () => {
  expect(suggestProgression([bench], [{ plan_exercise_id: "bench", reps: 4, load_kg: 82.5 }])).toEqual([
    {
      plan_exercise_id: "bench",
      name: "Bench",
      decision: "deload",
      suggested_load_kg: 82.5 * DELOAD_FACTOR,
      heaviest_load_kg: 82.5,
    },
  ]);
});

test("non-finite sibling sets are ignored when another set is valid", () => {
  expect(
    suggestProgression(
      [squat],
      [
        { plan_exercise_id: "squat", reps: 5, load_kg: Number.NaN },
        { plan_exercise_id: "squat", reps: Number.POSITIVE_INFINITY, load_kg: 100 },
        { plan_exercise_id: "squat", reps: 5, load_kg: 100 },
      ],
    ),
  ).toEqual([
    {
      plan_exercise_id: "squat",
      name: "Squat",
      decision: "increase",
      suggested_load_kg: 100 + INCREASE_KG,
      heaviest_load_kg: 100,
    },
  ]);
});
