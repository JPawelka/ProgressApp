export type TrainingGoal = "mass" | "strength" | "endurance";

export interface Plan {
  id: string;
  user_id: string;
  goal: TrainingGoal;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanExercise {
  id: string;
  user_id: string;
  plan_id: string;
  name: string;
  sort_order: number;
  default_reps: number | null;
  default_load_kg: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  plan_id: string;
  performed_at: string;
  created_at: string;
  updated_at: string;
}

export interface SessionSet {
  id: string;
  user_id: string;
  session_id: string;
  plan_exercise_id: string;
  set_number: number;
  reps: number | null;
  load_kg: string | null;
  created_at: string;
  updated_at: string;
}
