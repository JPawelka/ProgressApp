import { z } from "zod";

export const trainingGoalSchema = z.enum(["mass", "strength", "endurance"]);

export const planExerciseAiSchema = z.object({
  name: z.string().trim().min(1),
  default_reps: z.number().int().positive().nullable(),
  default_load_kg: z.number().nonnegative().nullable(),
});

export const planAiSchema = z.object({
  name: z.string().trim().min(1).nullable(),
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
 * JSON Schema for OpenRouter `response_format.json_schema` (strict).
 * Optional fields are represented as nullable so `required` can list every key.
 */
export const planAiJsonSchema = {
  type: "object",
  properties: {
    name: { type: ["string", "null"] },
    exercises: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          default_reps: { type: ["integer", "null"] },
          default_load_kg: { type: ["number", "null"] },
        },
        required: ["name", "default_reps", "default_load_kg"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "exercises"],
  additionalProperties: false,
} as const;
