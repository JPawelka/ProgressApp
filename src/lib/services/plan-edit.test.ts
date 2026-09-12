import { expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PlanEditCardinalityError,
  PlanEditNotFoundError,
  PlanEditPersistError,
  deletePlan,
  planEditFailure,
  updateExercise,
  updatePlanName,
} from "./plan-edit";

const callerId = "user-a";
const planId = "plan-a";
const exerciseId = "exercise-a";

const exerciseInput = {
  name: "Squat",
  default_reps: 5,
  default_load_kg: 100,
};

interface Call {
  op: "update" | "delete";
  table: string;
  filters: Record<string, string>;
}

/** Empty maybeSingle — owner isolation oracle. Never returns another user's row. */
function createFakeWriteClient() {
  const calls: Call[] = [];
  const empty = { data: null, error: null };

  function writeChain(op: Call["op"], table: string) {
    const filters: Record<string, string> = {};
    const chain = {
      eq(column: string, value: string) {
        filters[column] = value;
        return chain;
      },
      select() {
        return chain;
      },
      maybeSingle() {
        calls.push({ op, table, filters: { ...filters } });
        return Promise.resolve(empty);
      },
    };
    return chain;
  }

  const client = {
    from(table: string) {
      return {
        update() {
          return writeChain("update", table);
        },
        delete() {
          return writeChain("delete", table);
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

test("updatePlanName with empty maybeSingle throws not-found and filters user_id", async () => {
  const { client, calls } = createFakeWriteClient();

  await expect(updatePlanName(client, callerId, planId, "Renamed")).rejects.toBeInstanceOf(PlanEditNotFoundError);
  expect(calls).toEqual([{ op: "update", table: "plans", filters: { id: planId, user_id: callerId } }]);
});

test("deletePlan with empty maybeSingle throws not-found and filters user_id", async () => {
  const { client, calls } = createFakeWriteClient();

  await expect(deletePlan(client, callerId, planId)).rejects.toBeInstanceOf(PlanEditNotFoundError);
  expect(calls).toEqual([{ op: "delete", table: "plans", filters: { id: planId, user_id: callerId } }]);
});

test("updateExercise with empty maybeSingle throws not-found and filters id plan_id user_id", async () => {
  const { client, calls } = createFakeWriteClient();

  await expect(updateExercise(client, callerId, planId, exerciseId, exerciseInput)).rejects.toBeInstanceOf(
    PlanEditNotFoundError,
  );
  expect(calls).toEqual([
    {
      op: "update",
      table: "plan_exercises",
      filters: { id: exerciseId, plan_id: planId, user_id: callerId },
    },
  ]);
});

test("maps not-found to 404 Not found", () => {
  expect(planEditFailure(new PlanEditNotFoundError())).toEqual({
    error: "Not found",
    status: 404,
  });
});

test("maps cardinality to 409 with product copy", () => {
  expect(planEditFailure(new PlanEditCardinalityError("Plan cannot have more than 8 exercises"))).toEqual({
    error: "Plan cannot have more than 8 exercises",
    status: 409,
  });
  expect(planEditFailure(new PlanEditCardinalityError("Plan must have at least one exercise"))).toEqual({
    error: "Plan must have at least one exercise",
    status: 409,
  });
});

test("maps persist to 500 Failed to save plan without leaking persist text", () => {
  expect(planEditFailure(new PlanEditPersistError("duplicate key value"))).toEqual({
    error: "Failed to save plan",
    status: 500,
  });
});

test("returns null for unknown errors", () => {
  expect(planEditFailure(new Error("boom"))).toBeNull();
  expect(planEditFailure("string")).toBeNull();
});
