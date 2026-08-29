-- Insert a session and its complete sets in one transaction.
-- Locks the owner plan row so a failed set batch cannot leave an empty session.

CREATE OR REPLACE FUNCTION public.log_training_session(
  p_plan_id uuid,
  p_sets jsonb
)
RETURNS public.sessions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  elem jsonb;
  ex_id uuid;
  set_num int;
  set_reps int;
  set_load numeric;
  created public.sessions;
BEGIN
  PERFORM 1
  FROM public.plans
  WHERE id = p_plan_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found';
  END IF;

  IF p_sets IS NULL
     OR jsonb_typeof(p_sets) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_sets) < 1 THEN
    RAISE EXCEPTION 'Empty sets';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_sets) AS e(value)
    GROUP BY e.value->>'plan_exercise_id', e.value->>'set_number'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Invalid sets';
  END IF;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_sets)
  LOOP
    BEGIN
      ex_id := (elem->>'plan_exercise_id')::uuid;
      set_num := (elem->>'set_number')::int;
      set_reps := (elem->>'reps')::int;
      set_load := (elem->>'load_kg')::numeric;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'Invalid sets';
    END;

    IF set_num IS NULL OR set_num < 1 OR set_num > 8
       OR set_reps IS NULL OR set_reps < 1 OR set_reps > 100
       OR set_load IS NULL OR set_load < 0 OR set_load > 9999.99 THEN
      RAISE EXCEPTION 'Invalid sets';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.plan_exercises
      WHERE id = ex_id
        AND plan_id = p_plan_id
        AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not found';
    END IF;
  END LOOP;

  INSERT INTO public.sessions (user_id, plan_id, performed_at)
  VALUES (auth.uid(), p_plan_id, now())
  RETURNING * INTO created;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_sets)
  LOOP
    INSERT INTO public.session_sets (
      user_id,
      session_id,
      plan_exercise_id,
      set_number,
      reps,
      load_kg
    )
    VALUES (
      auth.uid(),
      created.id,
      (elem->>'plan_exercise_id')::uuid,
      (elem->>'set_number')::int,
      (elem->>'reps')::int,
      (elem->>'load_kg')::numeric
    );
  END LOOP;

  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.log_training_session(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_training_session(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
