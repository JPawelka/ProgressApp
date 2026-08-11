-- Owner-scoped persistence for plans and session history (F-01 / gate-product-routes)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.training_goal AS ENUM ('mass', 'strength', 'endurance');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  goal public.training_goal NOT NULL,
  name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans (id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  default_reps int NULL,
  default_load_kg numeric(6, 2) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans (id) ON DELETE CASCADE,
  performed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.session_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions (id) ON DELETE CASCADE,
  plan_exercise_id uuid NOT NULL REFERENCES public.plan_exercises (id) ON DELETE CASCADE,
  set_number int NOT NULL,
  reps int NULL,
  load_kg numeric(6, 2) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, plan_exercise_id, set_number)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX plans_user_id_created_at_idx ON public.plans (user_id, created_at DESC);
CREATE INDEX plan_exercises_plan_id_sort_order_idx ON public.plan_exercises (plan_id, sort_order);
CREATE INDEX plan_exercises_user_id_idx ON public.plan_exercises (user_id);
CREATE INDEX sessions_user_id_performed_at_idx ON public.sessions (user_id, performed_at DESC);
CREATE INDEX sessions_plan_id_performed_at_idx ON public.sessions (plan_id, performed_at DESC);
CREATE INDEX session_sets_session_exercise_set_idx ON public.session_sets (session_id, plan_exercise_id, set_number);
CREATE INDEX session_sets_plan_exercise_id_session_id_idx ON public.session_sets (plan_exercise_id, session_id);
CREATE INDEX session_sets_user_id_idx ON public.session_sets (user_id);

-- ---------------------------------------------------------------------------
-- updated_at helper + triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER plans_set_updated_at
BEFORE UPDATE ON public.plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER plan_exercises_set_updated_at
BEFORE UPDATE ON public.plan_exercises
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER sessions_set_updated_at
BEFORE UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER session_sets_set_updated_at
BEFORE UPDATE ON public.session_sets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Child ownership / lineage consistency triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_plan_exercises_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_owner uuid;
BEGIN
  SELECT user_id INTO parent_owner FROM public.plans WHERE id = NEW.plan_id;
  IF parent_owner IS NULL THEN
    RAISE EXCEPTION 'plan_exercises: plan_id % not found', NEW.plan_id;
  END IF;
  IF NEW.user_id IS DISTINCT FROM parent_owner THEN
    RAISE EXCEPTION 'plan_exercises: user_id must match parent plan owner';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER plan_exercises_enforce_owner
BEFORE INSERT OR UPDATE ON public.plan_exercises
FOR EACH ROW
EXECUTE FUNCTION public.enforce_plan_exercises_owner();

CREATE OR REPLACE FUNCTION public.enforce_sessions_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_owner uuid;
BEGIN
  SELECT user_id INTO parent_owner FROM public.plans WHERE id = NEW.plan_id;
  IF parent_owner IS NULL THEN
    RAISE EXCEPTION 'sessions: plan_id % not found', NEW.plan_id;
  END IF;
  IF NEW.user_id IS DISTINCT FROM parent_owner THEN
    RAISE EXCEPTION 'sessions: user_id must match parent plan owner';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sessions_enforce_owner
BEFORE INSERT OR UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_sessions_owner();

CREATE OR REPLACE FUNCTION public.enforce_session_sets_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_owner uuid;
  session_plan_id uuid;
  exercise_owner uuid;
  exercise_plan_id uuid;
BEGIN
  SELECT user_id, plan_id INTO session_owner, session_plan_id
  FROM public.sessions
  WHERE id = NEW.session_id;

  IF session_owner IS NULL THEN
    RAISE EXCEPTION 'session_sets: session_id % not found', NEW.session_id;
  END IF;

  IF NEW.user_id IS DISTINCT FROM session_owner THEN
    RAISE EXCEPTION 'session_sets: user_id must match parent session owner';
  END IF;

  SELECT user_id, plan_id INTO exercise_owner, exercise_plan_id
  FROM public.plan_exercises
  WHERE id = NEW.plan_exercise_id;

  IF exercise_owner IS NULL THEN
    RAISE EXCEPTION 'session_sets: plan_exercise_id % not found', NEW.plan_exercise_id;
  END IF;

  IF exercise_plan_id IS DISTINCT FROM session_plan_id THEN
    RAISE EXCEPTION 'session_sets: plan_exercise must belong to the same plan as the session';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER session_sets_enforce_integrity
BEFORE INSERT OR UPDATE ON public.session_sets
FOR EACH ROW
EXECUTE FUNCTION public.enforce_session_sets_integrity();

-- ---------------------------------------------------------------------------
-- RLS (granular per-operation policies)
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select_own ON public.plans
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY plans_insert_own ON public.plans
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY plans_update_own ON public.plans
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY plans_delete_own ON public.plans
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY plan_exercises_select_own ON public.plan_exercises
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY plan_exercises_insert_own ON public.plan_exercises
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY plan_exercises_update_own ON public.plan_exercises
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY plan_exercises_delete_own ON public.plan_exercises
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY sessions_select_own ON public.sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY sessions_insert_own ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY sessions_update_own ON public.sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY sessions_delete_own ON public.sessions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY session_sets_select_own ON public.session_sets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY session_sets_insert_own ON public.session_sets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY session_sets_update_own ON public.session_sets
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY session_sets_delete_own ON public.session_sets
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
