import { GEMINI_API_KEY } from "astro:env/server";
import type { TrainingGoal } from "@/types";
import { geminiPlanResponseSchema } from "@/lib/plans/plan-generation-schema";

/** Current free-tier flash model; Google 404s older ids for new API keys. */
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const REQUEST_TIMEOUT_MS = 45_000;

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY);
}

export async function requestPlanCompletion(goal: TrainingGoal): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new GeminiError("Gemini API key is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "You generate beginner-to-intermediate gym training plans. Return only structured JSON matching the schema. Use realistic exercise names and sensible default reps/loads in kg. Prefer compound lifts appropriate for the goal.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: `Generate a training plan for the goal: ${goal}. Include 3 to 8 exercises.` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: geminiPlanResponseSchema,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new GeminiError(
        `Gemini request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        response.status,
      );
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content || typeof content !== "string") {
      throw new GeminiError("Gemini response missing message content");
    }

    return content;
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new GeminiError("Gemini request timed out");
    }
    throw new GeminiError(error instanceof Error ? error.message : "Gemini request failed");
  } finally {
    clearTimeout(timeout);
  }
}
