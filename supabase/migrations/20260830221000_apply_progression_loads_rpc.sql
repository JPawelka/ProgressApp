-- Update plan default_load_kg for every exercise logged in a session, all-or-nothing.
-- Locks the owner session row so a mid-loop failure cannot leave a half-applied plan.

CREATE OR REPLACE FUNCTION public.apply_progression_loads(
  p_session_id uuid,
  p_loads jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  sess public.sessions;
  elem jsonb;
  ex_id uuid;
  set_load numeric;
BEGIN
  SELECT *
  INTO sess
  FROM public.sessions
  WHERE id = p_session_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found';
  END IF;

  IF p_loads IS NULL
     OR jsonb_typeof(p_loads) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_loads) < 1 THEN
    RAISE EXCEPTION 'Empty loads';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_loads) AS e(value)
    GROUP BY e.value->>'plan_exercise_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Invalid loads';
  END IF;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_loads)
  LOOP
    BEGIN
      ex_id := (elem->>'plan_exercise_id')::uuid;
      set_load := (elem->>'load_kg')::numeric;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'Invalid loads';
    END;

    IF set_load IS NULL OR set_load < 0 OR set_load > 9999.99 THEN
      RAISE EXCEPTION 'Invalid loads';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.plan_exercises
      WHERE id = ex_id
        AND plan_id = sess.plan_id
        AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not found';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT plan_exercise_id
    FROM public.session_sets
    WHERE session_id = sess.id
    EXCEPT
    SELECT (value->>'plan_exercise_id')::uuid
    FROM jsonb_array_elements(p_loads)
  ) OR EXISTS (
    SELECT (value->>'plan_exercise_id')::uuid
    FROM jsonb_array_elements(p_loads)
    EXCEPT
    SELECT plan_exercise_id
    FROM public.session_sets
    WHERE session_id = sess.id
  ) THEN
    RAISE EXCEPTION 'Invalid loads';
  END IF;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_loads)
  LOOP
    UPDATE public.plan_exercises
    SET default_load_kg = (elem->>'load_kg')::numeric
    WHERE id = (elem->>'plan_exercise_id')::uuid
      AND plan_id = sess.plan_id
      AND user_id = auth.uid();

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not found';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_progression_loads(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_progression_loads(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
