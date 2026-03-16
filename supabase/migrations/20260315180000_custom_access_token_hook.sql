-- ============================================================
-- FieldTrack 2.0 — Custom Access Token Hook (Phase 5)
--
-- Embeds organization_id, employee_id, and role into the JWT's
-- app_metadata so the API can skip DB lookups on every request.
--
-- The API still maintains a Redis cache as a fallback for tokens
-- minted before this hook was deployed.
--
-- Supabase calls this function before issuing every JWT.
-- See: https://supabase.com/docs/guides/auth/auth-hooks
-- ============================================================

-- Grant the auth schema permission to call this function
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id     UUID;
    v_org_id      UUID;
    v_employee_id UUID;
    v_role        TEXT;
    v_claims      jsonb;
BEGIN
    -- Extract the Supabase auth user id from the hook event
    v_user_id := (event->>'userId')::UUID;

    -- Look up the application user (org + role) — fast PK lookup on users.id
    SELECT organization_id, role::TEXT
      INTO v_org_id, v_role
      FROM public.users
     WHERE id = v_user_id
     LIMIT 1;

    -- Look up the employee_id (nullable — ADMINs may not have an employee row)
    IF v_org_id IS NOT NULL THEN
        SELECT id
          INTO v_employee_id
          FROM public.employees
         WHERE user_id = v_user_id
           AND organization_id = v_org_id
           AND is_active = TRUE
         LIMIT 1;
    END IF;

    -- Merge our claims into app_metadata
    v_claims := event->'claims';

    IF v_org_id IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{app_metadata,organization_id}', to_jsonb(v_org_id::TEXT));
    END IF;

    IF v_employee_id IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{app_metadata,employee_id}', to_jsonb(v_employee_id::TEXT));
    END IF;

    -- role is already in user_metadata (set at signup) — mirror it to
    -- app_metadata so the API has a single consistent location to read from
    IF v_role IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{app_metadata,role}', to_jsonb(v_role));
    END IF;

    RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- Restrict execution to the Supabase auth admin role only
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
