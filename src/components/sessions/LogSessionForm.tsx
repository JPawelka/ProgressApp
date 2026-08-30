import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { planDisplayName } from "@/lib/plans/display";
import { cn } from "@/lib/utils";
import type { Plan, PlanExercise } from "@/types";

const START_SETS = 3;
const MAX_SETS = 8;

const inputClass = cn(
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white",
  "outline-none focus:border-purple-400/50 focus:ring-2 focus:ring-purple-400/20",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

interface LogSessionFormProps {
  plan: Plan;
  exercises: PlanExercise[];
}

interface SetDraft {
  reps: string;
  load: string;
}

function fieldText(value: string | number | null | undefined): string {
  if (value == null || value === "") {
    return "";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return value;
}

function defaultDraft(exercise: PlanExercise): SetDraft {
  return {
    reps: exercise.default_reps == null ? "" : String(exercise.default_reps),
    load: fieldText(exercise.default_load_kg),
  };
}

function initialRows(exercise: PlanExercise): SetDraft[] {
  return Array.from({ length: START_SETS }, () => defaultDraft(exercise));
}

function parseReps(value: string | number): number | null {
  const trimmed = fieldText(value).trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return Number.NaN;
  }
  return parsed;
}

function parseLoad(value: string | number): number | null {
  const trimmed = fieldText(value).trim();
  if (trimmed === "") {
    return null;
  }
  return Number(trimmed);
}

function isCompleteSet(draft: SetDraft): { reps: number; load_kg: number } | null {
  const reps = parseReps(draft.reps);
  const load = parseLoad(draft.load);
  if (reps === null || load === null) {
    return null;
  }
  if (!Number.isInteger(reps) || reps < 1 || reps > 100) {
    return null;
  }
  if (!Number.isFinite(load) || load < 0 || load > 9999.99) {
    return null;
  }
  return { reps, load_kg: load };
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Request failed";
  } catch {
    return "Request failed";
  }
}

async function readSessionId(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { session?: { id?: unknown } };
    const id = data.session?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export default function LogSessionForm({ plan, exercises }: LogSessionFormProps) {
  const [rows, setRows] = useState<Record<string, SetDraft[]>>(() =>
    Object.fromEntries(exercises.map((exercise) => [exercise.id, initialRows(exercise)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateRow(exerciseId: string, index: number, patch: Partial<SetDraft>) {
    setRows((current) => {
      const list = current[exerciseId] ?? [];
      return {
        ...current,
        [exerciseId]: list.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
      };
    });
  }

  function addSet(exerciseId: string) {
    const exercise = exercises.find((row) => row.id === exerciseId);
    if (!exercise) {
      return;
    }
    setRows((current) => {
      const list = current[exerciseId] ?? [];
      if (list.length >= MAX_SETS) {
        return current;
      }
      return { ...current, [exerciseId]: [...list, defaultDraft(exercise)] };
    });
  }

  async function save() {
    setError(null);
    const sets: { plan_exercise_id: string; set_number: number; reps: number; load_kg: number }[] = [];

    for (const exercise of exercises) {
      const list = rows[exercise.id] ?? [];
      let setNumber = 1;
      for (const draft of list) {
        const complete = isCompleteSet(draft);
        if (!complete) {
          continue;
        }
        if (setNumber > MAX_SETS) {
          setError("Each exercise can have at most 8 sets");
          return;
        }
        sets.push({
          plan_exercise_id: exercise.id,
          set_number: setNumber,
          reps: complete.reps,
          load_kg: complete.load_kg,
        });
        setNumber += 1;
      }
    }

    if (sets.length === 0) {
      setError("Log at least one complete set (reps and load)");
      return;
    }

    setPending(true);
    try {
      const response = await fetch(`/api/plans/${plan.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sets }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const sessionId = await readSessionId(response);
      if (!sessionId) {
        setError("Session saved but the suggestion page could not be opened");
        return;
      }
      window.location.href = `/sessions/${sessionId}/suggestion`;
    } catch {
      setError("Failed to save session");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">{planDisplayName(plan.name, plan.goal)}</h1>
        <p className="mt-1 text-sm text-blue-100/60">
          Log this session. Blank rows are skipped. At least one complete set is required.
        </p>
      </header>

      {exercises.map((exercise) => {
        const list = rows[exercise.id] ?? [];
        const canAdd = list.length < MAX_SETS;
        return (
          <section
            key={exercise.id}
            className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl"
          >
            <h2 className="text-lg font-semibold">{exercise.name}</h2>
            <div className="space-y-3">
              {list.map((draft, index) => (
                <div key={`${exercise.id}-${index}`} className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-blue-100/60">Set {index + 1} reps</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={draft.reps}
                      disabled={pending}
                      onChange={(event) => {
                        updateRow(exercise.id, index, { reps: event.target.value });
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-blue-100/60">Load (kg)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.load}
                      disabled={pending}
                      onChange={(event) => {
                        updateRow(exercise.id, index, { load: event.target.value });
                      }}
                      className={inputClass}
                    />
                  </div>
                </div>
              ))}
            </div>
            {canAdd ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                className="text-white hover:bg-white/10"
                onClick={() => {
                  addSet(exercise.id);
                }}
              >
                Add set
              </Button>
            ) : (
              <p className="text-sm text-blue-100/60">This exercise already has 8 sets.</p>
            )}
          </section>
        );
      })}

      <ServerError message={error} />

      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          void save();
        }}
        className="bg-purple-600 text-white hover:bg-purple-500"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Save session
      </Button>
    </div>
  );
}
