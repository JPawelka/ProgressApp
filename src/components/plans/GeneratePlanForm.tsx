import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { GOAL_LABELS } from "@/lib/plans/display";
import { planIdFromGenerateResponse } from "@/lib/plans/plan-id-from-generate-response";
import { errorMessageFromBody } from "@/lib/http/error-message-from-body";
import { cn } from "@/lib/utils";
import type { TrainingGoal } from "@/types";

const GOALS: TrainingGoal[] = ["mass", "strength", "endurance"];

export default function GeneratePlanForm() {
  const [goal, setGoal] = useState<TrainingGoal>("strength");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });

      const data: unknown = await response.json();
      if (!response.ok) {
        setError(errorMessageFromBody(data, "Failed to generate plan"));
        return;
      }

      const planId = planIdFromGenerateResponse(data);
      if (!planId) {
        setError("Plan generated but the plan page could not be opened");
        return;
      }

      window.location.href = `/plans/${planId}`;
    } catch {
      setError("Failed to generate plan");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2 text-left">
        <label htmlFor="goal" className="text-sm font-medium text-blue-100/80">
          Training goal
        </label>
        <select
          id="goal"
          name="goal"
          value={goal}
          disabled={isSubmitting}
          onChange={(event) => {
            setGoal(event.target.value as TrainingGoal);
          }}
          className={cn(
            "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white",
            "outline-none focus:border-purple-400/50 focus:ring-2 focus:ring-purple-400/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {GOALS.map((value) => (
            <option key={value} value={value} className="bg-slate-900 text-white">
              {GOAL_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <ServerError message={error} />

      <Button type="submit" disabled={isSubmitting} className="w-full bg-purple-600 text-white hover:bg-purple-500">
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Generating plan…
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            Generate plan
          </>
        )}
      </Button>
    </form>
  );
}
