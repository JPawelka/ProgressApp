import { OPENROUTER_API_KEY } from "astro:env/server";
import type { TrainingGoal } from "@/types";
import { planAiJsonSchema } from "@/lib/plans/plan-generation-schema";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Cheap structured-output capable model on OpenRouter; swap if responses are flaky. */
const OPENROUTER_MODEL = "openai/gpt-4o-mini";

const REQUEST_TIMEOUT_MS = 45_000;

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(OPENROUTER_API_KEY);
}

export async function requestPlanCompletion(goal: TrainingGoal): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new OpenRouterError("OpenRouter API key is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://progressapp.julpawcio.workers.dev",
        "X-OpenRouter-Title": "ProgressApp",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You generate beginner-to-intermediate gym training plans. Return only structured JSON matching the schema. Use realistic exercise names and sensible default reps/loads in kg. Prefer compound lifts appropriate for the goal.",
          },
          {
            role: "user",
            content: `Generate a training plan for the goal: ${goal}. Include 3 to 8 exercises.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "training_plan",
            strict: true,
            schema: planAiJsonSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new OpenRouterError(
        `OpenRouter request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        response.status,
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new OpenRouterError("OpenRouter response missing message content");
    }

    return content;
  } catch (error) {
    if (error instanceof OpenRouterError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenRouterError("OpenRouter request timed out");
    }
    throw new OpenRouterError(error instanceof Error ? error.message : "OpenRouter request failed");
  } finally {
    clearTimeout(timeout);
  }
}
