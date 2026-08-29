import { z } from "zod";

const planNameValueSchema = z
  .union([z.string(), z.null()])
  .transform((value): string | null => {
    if (value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  })
  .refine((value) => value === null || value.length <= 100, { message: "Name must be at most 100 characters" });

export const patchPlanSchema = z
  .object({
    name: planNameValueSchema,
  })
  .strict();

export const exerciseWriteSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    default_reps: z.number().int().min(1).max(100).nullable(),
    default_load_kg: z.number().nonnegative().max(9999.99).nullable(),
  })
  .strict();

export type PatchPlanInput = z.infer<typeof patchPlanSchema>;
export type ExerciseWriteInput = z.infer<typeof exerciseWriteSchema>;

export function formatPlanEditRequestError(error: z.ZodError) {
  return z.treeifyError(error);
}
