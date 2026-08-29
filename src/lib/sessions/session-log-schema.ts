import { z } from "zod";

export const sessionSetWriteSchema = z
  .object({
    plan_exercise_id: z.uuid(),
    set_number: z.number().int().min(1).max(8),
    reps: z.number().int().min(1).max(100),
    load_kg: z.number().nonnegative().max(9999.99),
  })
  .strict();

export const logSessionSchema = z
  .object({
    sets: z.array(sessionSetWriteSchema).min(1),
  })
  .strict()
  .refine(
    (body) => {
      const keys = body.sets.map((row) => `${row.plan_exercise_id}:${row.set_number}`);
      return new Set(keys).size === keys.length;
    },
    { message: "Each exercise must have unique set_number values" },
  );

export type SessionSetWriteInput = z.infer<typeof sessionSetWriteSchema>;
export type LogSessionInput = z.infer<typeof logSessionSchema>;

export function formatLogSessionRequestError(error: z.ZodError) {
  return z.treeifyError(error);
}
