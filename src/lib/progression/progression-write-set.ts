import type { ProgressionSuggestion } from "@/lib/progression/progression-rule";

export interface ProgressionLoadRow {
  plan_exercise_id: string;
  load_kg: number;
}

export type SaveLoadsResult = { ok: true; loads: ProgressionLoadRow[] } | { ok: false };

function completeLoad(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const load = Number(trimmed);
  if (!Number.isFinite(load) || load < 0 || load > 9999.99) {
    return null;
  }
  return load;
}

export function buildAcceptAllLoads(suggestions: ProgressionSuggestion[]): ProgressionLoadRow[] {
  return suggestions.map((row) => ({
    plan_exercise_id: row.plan_exercise_id,
    load_kg: row.suggested_load_kg,
  }));
}

export function buildSaveLoads(
  suggestions: ProgressionSuggestion[],
  fieldMap: Record<string, string>,
): SaveLoadsResult {
  const loads: ProgressionLoadRow[] = [];
  for (const suggestion of suggestions) {
    const load = completeLoad(fieldMap[suggestion.plan_exercise_id] ?? "");
    if (load === null) {
      return { ok: false };
    }
    loads.push({ plan_exercise_id: suggestion.plan_exercise_id, load_kg: load });
  }
  return { ok: true, loads };
}
