import { z } from "zod";

export const progressionLoadWriteSchema = z
  .object({
    plan_exercise_id: z.uuid(),
    load_kg: z.number().nonnegative().max(9999.99),
  })
  .strict();

export const applyProgressionSchema = z
  .object({
    loads: z.array(progressionLoadWriteSchema).min(1),
  })
  .strict()
  .refine(
    (body) => {
      const ids = body.loads.map((row) => row.plan_exercise_id);
      return new Set(ids).size === ids.length;
    },
    { message: "Each exercise must appear once" },
  );

export type ProgressionLoadWriteInput = z.infer<typeof progressionLoadWriteSchema>;
export type ApplyProgressionInput = z.infer<typeof applyProgressionSchema>;

export function formatApplyProgressionRequestError(error: z.ZodError) {
  return z.treeifyError(error);
}
