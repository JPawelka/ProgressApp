import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProgressionDecision, ProgressionSuggestion } from "@/lib/progression/progression-rule";

const inputClass = cn(
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white",
  "outline-none focus:border-purple-400/50 focus:ring-2 focus:ring-purple-400/20",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

const DECISION_LABEL: Record<ProgressionDecision, string> = {
  increase: "Increase",
  hold: "Hold",
  deload: "Deload",
};

interface SuggestionFormProps {
  sessionId: string;
  suggestions: ProgressionSuggestion[];
}

function parseLoad(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return Number(trimmed);
}

function completeLoad(value: string): number | null {
  const load = parseLoad(value);
  if (load === null || !Number.isFinite(load) || load < 0 || load > 9999.99) {
    return null;
  }
  return load;
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Request failed";
  } catch {
    return "Request failed";
  }
}

export default function SuggestionForm({ sessionId, suggestions }: SuggestionFormProps) {
  const [loads, setLoads] = useState<Record<string, string>>(() =>
    Object.fromEntries(suggestions.map((row) => [row.plan_exercise_id, String(row.suggested_load_kg)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(rows: { plan_exercise_id: string; load_kg: number }[]) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/progression`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loads: rows }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      window.location.href = "/sessions";
    } catch {
      setError("Failed to save progression");
    } finally {
      setPending(false);
    }
  }

  function save() {
    const rows: { plan_exercise_id: string; load_kg: number }[] = [];
    for (const suggestion of suggestions) {
      const load = completeLoad(loads[suggestion.plan_exercise_id] ?? "");
      if (load === null) {
        setError("Enter a load between 0 and 9999.99 for every exercise");
        return;
      }
      rows.push({ plan_exercise_id: suggestion.plan_exercise_id, load_kg: load });
    }
    void submit(rows);
  }

  function acceptAll() {
    void submit(
      suggestions.map((row) => ({
        plan_exercise_id: row.plan_exercise_id,
        load_kg: row.suggested_load_kg,
      })),
    );
  }

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
                disabled={pending}
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

      <ServerError
        variant="info"
        message="Save keeps the loads in the boxes. Accept all uses the original suggestions and ignores any edits. Skip leaves plan defaults unchanged."
      />
      <ServerError message={error} />

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              acceptAll();
            }}
            className="bg-purple-600 text-white hover:bg-purple-500"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Accept all
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              save();
            }}
            className="bg-white/10 text-white hover:bg-white/20"
          >
            Save
          </Button>
        </div>
      ) : null}

      <a
        href="/sessions"
        className="inline-block text-sm text-purple-300 transition-colors hover:text-purple-100 hover:underline"
      >
        Skip
      </a>
    </div>
  );
}
