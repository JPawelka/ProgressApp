-- Lock parent plan row before add/delete so 1–8 exercise cardinality holds under concurrency.
-- Plan DELETE still uses table DELETE + CASCADE (no count guard on wipe).

CREATE OR REPLACE FUNCTION public.add_plan_exercise(
  p_plan_id uuid,
  p_name text,
  p_default_reps int,
  p_default_load_kg numeric
)
RETURNS public.plan_exercises
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n int;
  next_sort int;
  created public.plan_exercises;
BEGIN
  PERFORM 1
  FROM public.plans
  WHERE id = p_plan_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found';
  END IF;

  SELECT count(*)::int INTO n
  FROM public.plan_exercises
  WHERE plan_id = p_plan_id;

  IF n >= 8 THEN
    RAISE EXCEPTION 'Plan cannot have more than 8 exercises';
  END IF;

  SELECT coalesce(max(sort_order), -1) + 1 INTO next_sort
  FROM public.plan_exercises
  WHERE plan_id = p_plan_id;

  INSERT INTO public.plan_exercises (
    user_id,
    plan_id,
    name,
    sort_order,
    default_reps,
    default_load_kg
  )
  VALUES (
    auth.uid(),
    p_plan_id,
    p_name,
    next_sort,
    p_default_reps,
    p_default_load_kg
  )
  RETURNING * INTO created;

  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_plan_exercise(
  p_plan_id uuid,
  p_exercise_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  PERFORM 1
  FROM public.plans
  WHERE id = p_plan_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.plan_exercises
    WHERE id = p_exercise_id
      AND plan_id = p_plan_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not found';
  END IF;

  SELECT count(*)::int INTO n
  FROM public.plan_exercises
  WHERE plan_id = p_plan_id;

  IF n <= 1 THEN
    RAISE EXCEPTION 'Plan must have at least one exercise';
  END IF;

  DELETE FROM public.plan_exercises
  WHERE id = p_exercise_id
    AND plan_id = p_plan_id
    AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.add_plan_exercise(uuid, text, int, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_plan_exercise(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_plan_exercise(uuid, text, int, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_plan_exercise(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
