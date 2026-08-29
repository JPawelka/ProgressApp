import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { GOAL_LABELS, planDisplayName } from "@/lib/plans/display";
import { cn } from "@/lib/utils";
import type { Plan, PlanExercise } from "@/types";

const MIN_EXERCISES = 1;
const MAX_EXERCISES = 8;

const inputClass = cn(
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white",
  "outline-none focus:border-purple-400/50 focus:ring-2 focus:ring-purple-400/20",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

interface EditPlanFormProps {
  plan: Plan;
  exercises: PlanExercise[];
}

type ConfirmState = { kind: "plan" } | { kind: "exercise"; id: string } | null;

interface ExerciseDraft {
  name: string;
  reps: string;
  load: string;
}

function draftFromExercise(exercise: PlanExercise): ExerciseDraft {
  return {
    name: exercise.name,
    reps: exercise.default_reps == null ? "" : String(exercise.default_reps),
    load: exercise.default_load_kg ?? "",
  };
}

function parseReps(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return Number.NaN;
  }
  return parsed;
}

function parseLoad(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return Number(trimmed);
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Request failed";
  } catch {
    return "Request failed";
  }
}

export default function EditPlanForm({ plan, exercises: initialExercises }: EditPlanFormProps) {
  const [planName, setPlanName] = useState(plan.name ?? "");
  const [savedName, setSavedName] = useState(plan.name);
  const [exercises, setExercises] = useState(initialExercises);
  const [drafts, setDrafts] = useState<Partial<Record<string, ExerciseDraft>>>(() =>
    Object.fromEntries(initialExercises.map((exercise) => [exercise.id, draftFromExercise(exercise)])),
  );
  const [addName, setAddName] = useState("");
  const [addReps, setAddReps] = useState("");
  const [addLoad, setAddLoad] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const busy = pending !== null;
  const canAdd = exercises.length < MAX_EXERCISES;
  const canDeleteExercise = exercises.length > MIN_EXERCISES;

  function updateDraft(id: string, patch: Partial<ExerciseDraft>) {
    setDrafts((current) => {
      const existing = current[id] ?? { name: "", reps: "", load: "" };
      return { ...current, [id]: { ...existing, ...patch } };
    });
  }

  async function savePlanName() {
    setError(null);
    setPending("name");
    try {
      const response = await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: planName }),
      });
      const data = (await response.json()) as { plan?: Plan; error?: string };
      if (!response.ok) {
        setError(data.error ?? "Failed to update plan");
        return;
      }
      if (data.plan) {
        setSavedName(data.plan.name);
        setPlanName(data.plan.name ?? "");
      }
    } catch {
      setError("Failed to update plan");
    } finally {
      setPending(null);
    }
  }

  async function saveExercise(exercise: PlanExercise) {
    const draft = drafts[exercise.id] ?? draftFromExercise(exercise);
    const reps = parseReps(draft.reps);
    const load = parseLoad(draft.load);
    if (Number.isNaN(reps) || Number.isNaN(load)) {
      setError("Reps must be a whole number and load must be a number, or left empty.");
      return;
    }

    setError(null);
    setPending(`save-${exercise.id}`);
    try {
      const response = await fetch(`/api/plans/${plan.id}/exercises/${exercise.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          default_reps: reps,
          default_load_kg: load,
        }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const data = (await response.json()) as { exercise: PlanExercise };
      setExercises((current) => current.map((row) => (row.id === data.exercise.id ? data.exercise : row)));
      setDrafts((current) => ({ ...current, [data.exercise.id]: draftFromExercise(data.exercise) }));
    } catch {
      setError("Failed to update exercise");
    } finally {
      setPending(null);
    }
  }

  async function addExercise() {
    const reps = parseReps(addReps);
    const load = parseLoad(addLoad);
    if (addName.trim() === "") {
      setError("Exercise name is required.");
      return;
    }
    if (Number.isNaN(reps) || Number.isNaN(load)) {
      setError("Reps must be a whole number and load must be a number, or left empty.");
      return;
    }

    setError(null);
    setPending("add");
    try {
      const response = await fetch(`/api/plans/${plan.id}/exercises`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName,
          default_reps: reps,
          default_load_kg: load,
        }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const data = (await response.json()) as { exercise: PlanExercise };
      setExercises((current) => [...current, data.exercise]);
      setDrafts((current) => ({ ...current, [data.exercise.id]: draftFromExercise(data.exercise) }));
      setAddName("");
      setAddReps("");
      setAddLoad("");
    } catch {
      setError("Failed to add exercise");
    } finally {
      setPending(null);
    }
  }

  async function deleteExercise(id: string) {
    setError(null);
    setPending(`delete-${id}`);
    try {
      const response = await fetch(`/api/plans/${plan.id}/exercises/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setError(await readError(response));
        setConfirm(null);
        return;
      }
      setExercises((current) => current.filter((row) => row.id !== id));
      setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
      setConfirm(null);
    } catch {
      setError("Failed to delete exercise");
    } finally {
      setPending(null);
    }
  }

  async function deletePlan() {
    setError(null);
    setPending("delete-plan");
    try {
      const response = await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError(await readError(response));
        setConfirm(null);
        return;
      }
      window.location.href = "/plans";
    } catch {
      setError("Failed to delete plan");
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mt-4 mb-2 bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-3xl font-bold text-transparent">
          {planDisplayName(savedName, plan.goal)}
        </h1>
        <p className="text-sm text-blue-100/60">Goal: {GOAL_LABELS[plan.goal]}</p>
      </div>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl">
        <h2 className="text-lg font-semibold text-white">Plan name</h2>
        <label htmlFor="plan-name" className="text-sm font-medium text-blue-100/80">
          Name
        </label>
        <input
          id="plan-name"
          value={planName}
          maxLength={100}
          disabled={busy}
          onChange={(event) => {
            setPlanName(event.target.value);
          }}
          className={inputClass}
        />
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            void savePlanName();
          }}
          className="bg-purple-600 text-white hover:bg-purple-500"
        >
          {pending === "name" ? <Loader2 className="size-4 animate-spin" /> : null}
          Save name
        </Button>
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl">
        <h2 className="text-lg font-semibold text-white">Exercises</h2>
        <ol className="space-y-4">
          {exercises.map((exercise, index) => {
            const draft = drafts[exercise.id] ?? draftFromExercise(exercise);
            return (
              <li key={exercise.id} className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-blue-100/60">Exercise {index + 1}</p>
                <label className="block text-sm font-medium text-blue-100/80" htmlFor={`ex-name-${exercise.id}`}>
                  Name
                </label>
                <input
                  id={`ex-name-${exercise.id}`}
                  value={draft.name}
                  maxLength={80}
                  disabled={busy}
                  onChange={(event) => {
                    updateDraft(exercise.id, { name: event.target.value });
                  }}
                  className={inputClass}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="mb-1 block text-sm font-medium text-blue-100/80"
                      htmlFor={`ex-reps-${exercise.id}`}
                    >
                      Default reps
                    </label>
                    <input
                      id={`ex-reps-${exercise.id}`}
                      inputMode="numeric"
                      value={draft.reps}
                      disabled={busy}
                      onChange={(event) => {
                        updateDraft(exercise.id, { reps: event.target.value });
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1 block text-sm font-medium text-blue-100/80"
                      htmlFor={`ex-load-${exercise.id}`}
                    >
                      Default load (kg)
                    </label>
                    <input
                      id={`ex-load-${exercise.id}`}
                      inputMode="decimal"
                      value={draft.load}
                      disabled={busy}
                      onChange={(event) => {
                        updateDraft(exercise.id, { load: event.target.value });
                      }}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void saveExercise(exercise);
                    }}
                    className="bg-purple-600 text-white hover:bg-purple-500"
                  >
                    {pending === `save-${exercise.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
                    Save exercise
                  </Button>
                  {canDeleteExercise ? (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => {
                        setConfirm({ kind: "exercise", id: exercise.id });
                      }}
                    >
                      Delete exercise
                    </Button>
                  ) : null}
                </div>
                {confirm?.kind === "exercise" && confirm.id === exercise.id ? (
                  <div className="space-y-2 rounded-lg border border-red-400/30 bg-red-950/40 p-3 text-sm">
                    <p>Remove this exercise from the plan? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => {
                          void deleteExercise(exercise.id);
                        }}
                      >
                        {pending === `delete-${exercise.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
                        Confirm delete
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        className="text-white hover:bg-white/10"
                        onClick={() => {
                          setConfirm(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>

        {canAdd ? (
          <div className="space-y-3 border-t border-white/10 pt-4">
            <h3 className="font-medium text-white">Add exercise</h3>
            <label className="block text-sm font-medium text-blue-100/80" htmlFor="add-name">
              Name
            </label>
            <input
              id="add-name"
              value={addName}
              maxLength={80}
              disabled={busy}
              onChange={(event) => {
                setAddName(event.target.value);
              }}
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-blue-100/80" htmlFor="add-reps">
                  Default reps
                </label>
                <input
                  id="add-reps"
                  inputMode="numeric"
                  value={addReps}
                  disabled={busy}
                  onChange={(event) => {
                    setAddReps(event.target.value);
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-blue-100/80" htmlFor="add-load">
                  Default load (kg)
                </label>
                <input
                  id="add-load"
                  inputMode="decimal"
                  value={addLoad}
                  disabled={busy}
                  onChange={(event) => {
                    setAddLoad(event.target.value);
                  }}
                  className={inputClass}
                />
              </div>
            </div>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                void addExercise();
              }}
              className="bg-purple-600 text-white hover:bg-purple-500"
            >
              {pending === "add" ? <Loader2 className="size-4 animate-spin" /> : null}
              Add exercise
            </Button>
          </div>
        ) : (
          <p className="text-sm text-blue-100/60">This plan already has 8 exercises.</p>
        )}
      </section>

      <ServerError message={error} />

      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl">
        {confirm?.kind === "plan" ? (
          <div className="space-y-3">
            <p className="text-sm text-blue-100/80">
              Delete this plan and all of its exercises? This cannot be undone. If you later log sessions, history for
              this plan will also be removed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  void deletePlan();
                }}
              >
                {pending === "delete-plan" ? <Loader2 className="size-4 animate-spin" /> : null}
                Confirm delete plan
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                className="text-white hover:bg-white/10"
                onClick={() => {
                  setConfirm(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setConfirm({ kind: "plan" });
            }}
          >
            Delete plan
          </Button>
        )}
      </section>
    </div>
  );
}
