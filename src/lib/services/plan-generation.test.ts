import { expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistGeneratedPlan, PlanPersistError } from "./plan-generation";
import type { ValidatedPlanPayload } from "@/lib/plans/plan-generation-schema";

const userId = "user-1";
const planId = "plan-1";

const payload: ValidatedPlanPayload = {
  name: "Test plan",
  exercises: [
    { name: "Squat", default_reps: 5, default_load_kg: 100 },
    { name: "Bench", default_reps: 5, default_load_kg: 80 },
    { name: "Row", default_reps: 8, default_load_kg: 60 },
  ],
};

interface Call {
  op: string;
  table: string;
  payload?: unknown;
  filters?: Record<string, string>;
}

function createFakeSupabase(handlers: {
  planInsert: { data: { id: string } | null; error: { message: string } | null };
  exerciseInsert: { error: { message: string } | null };
  planDelete?: { error: { message: string } | null };
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          if (table === "plan_exercises") {
            calls.push({ op: "insert", table, payload });
            return Promise.resolve(handlers.exerciseInsert);
          }
          calls.push({ op: "insert", table, payload });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve(handlers.planInsert);
                },
              };
            },
          };
        },
        delete() {
          const filters: Record<string, string> = {};
          const chain = {
            eq(column: string, value: string) {
              filters[column] = value;
              return chain;
            },
            then(
              onFulfilled: (value: { error: { message: string } | null }) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) {
              calls.push({ op: "delete", table, filters: { ...filters } });
              return Promise.resolve(handlers.planDelete ?? { error: null }).then(onFulfilled, onRejected);
            },
          };
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

test("exercise insert failure throws and deletes the created plan", async () => {
  const { client, calls } = createFakeSupabase({
    planInsert: { data: { id: planId }, error: null },
    exerciseInsert: { error: { message: "insert failed" } },
  });

  await expect(persistGeneratedPlan(client, userId, "strength", payload)).rejects.toBeInstanceOf(PlanPersistError);
  expect(
    calls.some((call) => call.op === "delete" && call.filters?.id === planId && call.filters.user_id === userId),
  ).toBe(true);
});

test("plan insert failure throws and does not delete", async () => {
  const { client, calls } = createFakeSupabase({
    planInsert: { data: null, error: { message: "plan insert failed" } },
    exerciseInsert: { error: null },
  });

  await expect(persistGeneratedPlan(client, userId, "strength", payload)).rejects.toBeInstanceOf(PlanPersistError);
  expect(calls.some((call) => call.op === "delete")).toBe(false);
});

test("both inserts succeeding returns the plan id and does not delete", async () => {
  const { client, calls } = createFakeSupabase({
    planInsert: { data: { id: planId }, error: null },
    exerciseInsert: { error: null },
  });

  await expect(persistGeneratedPlan(client, userId, "strength", payload)).resolves.toBe(planId);
  expect(calls.some((call) => call.op === "delete")).toBe(false);
});

test("failed compensating delete still throws PlanPersistError", async () => {
  const { client } = createFakeSupabase({
    planInsert: { data: { id: planId }, error: null },
    exerciseInsert: { error: { message: "insert failed" } },
    planDelete: { error: { message: "delete failed" } },
  });

  await expect(persistGeneratedPlan(client, userId, "strength", payload)).rejects.toBeInstanceOf(PlanPersistError);
});
