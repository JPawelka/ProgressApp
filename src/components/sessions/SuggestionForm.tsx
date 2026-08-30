import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProgressionDecision, ProgressionSuggestion } from "@/lib/progression/progression-rule";

const inputClass = cn(
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white",
  "outline-none focus:border-purple-400/50 focus:ring-2 focus:ring-purple-400/20",
);

const DECISION_LABEL: Record<ProgressionDecision, string> = {
  increase: "Increase",
  hold: "Hold",
  deload: "Deload",
};

interface SuggestionFormProps {
  suggestions: ProgressionSuggestion[];
}

export default function SuggestionForm({ suggestions }: SuggestionFormProps) {
  const [loads, setLoads] = useState<Record<string, string>>(() =>
    Object.fromEntries(suggestions.map((row) => [row.plan_exercise_id, String(row.suggested_load_kg)])),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Next session</h1>
        <p className="mt-1 text-sm text-blue-100/60">
          Suggestion from the workout you just logged. Skip leaves plan defaults unchanged.
        </p>
      </header>

      {suggestions.length === 0 ? (
        <section className="rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl">
          <p className="text-sm text-blue-100/60">No logged exercises to suggest for.</p>
        </section>
      ) : (
        suggestions.map((row) => (
          <section
            key={row.plan_exercise_id}
            className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">{row.name}</h2>
              <span className="text-sm text-purple-200">{DECISION_LABEL[row.decision]}</span>
            </div>
            <div>
              <label className="mb-1 block text-xs text-blue-100/60">Suggested load (kg)</label>
              <input
                type="text"
                inputMode="decimal"
                value={loads[row.plan_exercise_id] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setLoads((current) => ({ ...current, [row.plan_exercise_id]: value }));
                }}
                className={inputClass}
              />
            </div>
          </section>
        ))
      )}

      <a
        href="/sessions"
        className="inline-block text-sm text-purple-300 transition-colors hover:text-purple-100 hover:underline"
      >
        Skip
      </a>
    </div>
  );
}
