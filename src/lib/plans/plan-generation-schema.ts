import { z } from "zod";

export const trainingGoalSchema = z.enum(["mass", "strength", "endurance"]);

export const planExerciseAiSchema = z.object({
  name: z.string().trim().min(1).max(80),
  default_reps: z.number().int().positive().nullable(),
  default_load_kg: z.number().nonnegative().nullable(),
});

export const planAiSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable(),
  exercises: z.array(planExerciseAiSchema).min(3).max(8),
});

export type ValidatedPlanPayload = z.infer<typeof planAiSchema>;

export const generatePlanRequestSchema = z.object({
  goal: trainingGoalSchema,
});

export function formatGeneratePlanRequestError(error: z.ZodError) {
  return z.treeifyError(error);
}

/**
 * JSON Schema for Gemini `generationConfig.responseSchema`.
 * Optional fields use `nullable` so every key can stay in `required`.
 */
export const geminiPlanResponseSchema = {
  type: "object",
  properties: {
    name: { type: "string", nullable: true },
    exercises: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          default_reps: { type: "integer", nullable: true },
          default_load_kg: { type: "number", nullable: true },
        },
        required: ["name", "default_reps", "default_load_kg"],
      },
    },
  },
  required: ["name", "exercises"],
} as const;
