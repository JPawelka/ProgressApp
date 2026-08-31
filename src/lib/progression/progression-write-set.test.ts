import { expect, test } from "vitest";
import { buildAcceptAllLoads, buildSaveLoads } from "./progression-write-set";
import type { ProgressionSuggestion } from "./progression-rule";

const squat: ProgressionSuggestion = {
  plan_exercise_id: "squat",
  name: "Squat",
  decision: "increase",
  suggested_load_kg: 102.5,
  heaviest_load_kg: 100,
};

const bench: ProgressionSuggestion = {
  plan_exercise_id: "bench",
  name: "Bench",
  decision: "hold",
  suggested_load_kg: 80,
  heaviest_load_kg: 80,
};

test("accept all uses original suggested loads and ignores the field map", () => {
  expect(buildAcceptAllLoads([squat, bench])).toEqual([
    { plan_exercise_id: "squat", load_kg: 102.5 },
    { plan_exercise_id: "bench", load_kg: 80 },
  ]);
});

test("save uses parsed field values", () => {
  expect(
    buildSaveLoads([squat, bench], {
      squat: "110",
      bench: "80",
    }),
  ).toEqual({
    ok: true,
    loads: [
      { plan_exercise_id: "squat", load_kg: 110 },
      { plan_exercise_id: "bench", load_kg: 80 },
    ],
  });
});

test("save fails closed when a field is empty or out of range", () => {
  expect(buildSaveLoads([squat], { squat: "" })).toEqual({ ok: false });
  expect(buildSaveLoads([squat], { squat: "10000" })).toEqual({ ok: false });
  expect(buildSaveLoads([squat], {})).toEqual({ ok: false });
});
