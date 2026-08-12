-- ============================================================================
-- MIGRATION: Pending Vehicle Claims + Estimate Approval Settings
-- Run this entire file in the Supabase SQL Editor.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. NEW TABLE: pending_vehicle_claims
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_vehicle_claims (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  walk_in_invitation_id  uuid REFERENCES public.wo_walk_in_invitations(id) ON DELETE SET NULL,
  work_order_id          uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  vehicle_id             uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  service_provider_id    uuid NOT NULL REFERENCES public.service_providers(id),
  target_email           text,                     -- plaintext, NULLed by PII trigger
  target_email_enc       text,                     -- encrypted
  target_email_idx       text,                     -- HMAC index
  target_user_id         uuid REFERENCES public.user_profiles(id),
  target_company_id      uuid REFERENCES public.company_profiles(id),
  vehicle_details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','claimed','expired')),
  claimed_at             timestamptz,
  expires_at             timestamptz NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pvc_target_email_idx   ON public.pending_vehicle_claims (target_email_idx) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pvc_target_user_id     ON public.pending_vehicle_claims (target_user_id)   WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pvc_target_company_id  ON public.pending_vehicle_claims (target_company_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pvc_status_expires     ON public.pending_vehicle_claims (status, expires_at);

-- ── PII trigger for target_email ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_pii_pending_vehicle_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.target_email IS NOT NULL AND NEW.target_email <> '' THEN
    NEW.target_email_enc := pii_encrypt(NEW.target_email);
    NEW.target_email_idx := pii_hmac_raw(upper(trim(NEW.target_email)));
    NEW.target_email     := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pii_pending_vehicle_claims ON public.pending_vehicle_claims;
CREATE TRIGGER trg_pii_pending_vehicle_claims
  BEFORE INSERT OR UPDATE ON public.pending_vehicle_claims
  FOR EACH ROW EXECUTE FUNCTION trg_pii_pending_vehicle_claims();

-- ── RLS policies ────────────────────────────────────────────────────────────
ALTER TABLE public.pending_vehicle_claims ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY pvc_admin_all ON public.pending_vehicle_claims
  FOR ALL TO authenticated
  USING (is_user_admin())
  WITH CHECK (is_user_admin());

-- Users can read their own claims (by target_user_id)
CREATE POLICY pvc_user_read ON public.pending_vehicle_claims
  FOR SELECT TO authenticated
  USING (
    target_user_id IN (
      SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Company owners/admins can read company claims
CREATE POLICY pvc_company_read ON public.pending_vehicle_claims
  FOR SELECT TO authenticated
  USING (
    target_company_id IN (
      SELECT cp.id FROM company_profiles cp
        JOIN user_profiles up ON up.id = cp.owner_user_id
      WHERE up.auth_user_id = auth.uid()
      UNION
      SELECT cu.company_id FROM company_users cu
        JOIN user_profiles up ON up.id = cu.user_id
      WHERE up.auth_user_id = auth.uid()
        AND cu.is_active = true
        AND (cu.is_admin = true OR cu.can_manage_fleet = true)
    )
  );

-- Providers can read claims they created
CREATE POLICY pvc_provider_read ON public.pending_vehicle_claims
  FOR SELECT TO authenticated
  USING (
    service_provider_id IN (
      SELECT sp.id FROM service_providers sp
        JOIN user_profiles up ON up.id = sp.owner_user_id
      WHERE up.auth_user_id = auth.uid()
    )
  );

-- Insert only via functions (SECURITY DEFINER)
CREATE POLICY pvc_insert_functions_only ON public.pending_vehicle_claims
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- Update only via functions
CREATE POLICY pvc_update_functions_only ON public.pending_vehicle_claims
  FOR UPDATE TO authenticated
  USING (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ALTER user_profiles + company_profiles: add require_estimate_approval
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
      AND column_name = 'require_estimate_approval'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN require_estimate_approval boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_profiles'
      AND column_name = 'require_estimate_approval'
  ) THEN
    ALTER TABLE public.company_profiles
      ADD COLUMN require_estimate_approval boolean NOT NULL DEFAULT false;
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Platform setting: default_require_estimate_approval
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (setting_key, setting_value, is_public)
VALUES ('default_require_estimate_approval', '{"enabled": false}'::jsonb, true)
ON CONFLICT (setting_key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. NEW RPC: get_pending_vehicle_claims()
--    Returns pending claims for the authenticated user (individual or company)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pending_vehicle_claims()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_email_idx  text;
  v_claims     jsonb;
BEGIN
  -- Resolve caller
  SELECT id INTO v_profile_id
  FROM user_profiles WHERE auth_user_id = auth.uid();

  IF v_profile_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Get caller's email HMAC for matching
  SELECT up.email_idx INTO v_email_idx
  FROM user_profiles up WHERE up.id = v_profile_id;

  SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb)
  INTO v_claims
  FROM (
    SELECT
      pvc.id AS claim_id,
      pvc.vehicle_id,
      pvc.work_order_id,
      pvc.service_provider_id,
      pvc.vehicle_details,
      pvc.expires_at,
      pvc.created_at,
      pvc.target_company_id,
      wo.work_order_number,
      sp.name AS provider_name,
      CASE WHEN pvc.target_company_id IS NOT NULL THEN 'company' ELSE 'individual' END AS claim_type
    FROM pending_vehicle_claims pvc
    LEFT JOIN work_orders wo ON wo.id = pvc.work_order_id
    LEFT JOIN service_providers sp ON sp.id = pvc.service_provider_id
    WHERE pvc.status = 'pending'
      AND pvc.expires_at > now()
      AND (
        -- Match by target_user_id
        pvc.target_user_id = v_profile_id
        -- Match by email HMAC
        OR (v_email_idx IS NOT NULL AND pvc.target_email_idx = v_email_idx AND pvc.target_user_id IS NULL)
        -- Match by company membership
        OR pvc.target_company_id IN (
          SELECT cp.id FROM company_profiles cp WHERE cp.owner_user_id = v_profile_id
          UNION
          SELECT cu.company_id FROM company_users cu
          WHERE cu.user_id = v_profile_id AND cu.is_active = true
            AND (cu.is_admin = true OR cu.can_manage_fleet = true)
        )
      )
    ORDER BY pvc.created_at DESC
  ) c;

  RETURN v_claims;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. MODIFY: create_walk_in_work_order
--    - Remove step 8 (no ownership creation)
--    - Add step 11b: insert pending_vehicle_claims
--    - If email matches existing user → set target_user_id + notification
--    - Return claim_id
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_walk_in_work_order(
  p_provider_user_id uuid,
  p_plate_number text,
  p_make text DEFAULT NULL::text,
  p_model text DEFAULT NULL::text,
  p_year integer DEFAULT NULL::integer,
  p_color text DEFAULT NULL::text,
  p_vin text DEFAULT NULL::text,
  p_owner_user_id uuid DEFAULT NULL::uuid,
  p_owner_company_id uuid DEFAULT NULL::uuid,
  p_walk_in_owner_name text DEFAULT NULL::text,
  p_walk_in_owner_phone text DEFAULT NULL::text,
  p_walk_in_owner_email text DEFAULT NULL::text,
  p_problem_description text DEFAULT NULL::text,
  p_priority text DEFAULT 'normal'::text,
  p_shop_id uuid DEFAULT NULL::uuid,
  p_initial_mileage integer DEFAULT NULL::integer,
  p_provider_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id     uuid;
  v_provider_id    uuid;
  v_is_owner       boolean := false;
  v_has_spu        boolean := false;
  v_has_mech       boolean := false;
  v_can_approve    boolean := false;
  v_vehicle_id     uuid;
  v_intake_status  uuid;
  v_wo_id          uuid;
  v_wo_number      text;
  v_seq            bigint;
  v_invite_id      uuid;
  v_invite_token   text;
  v_plate_upper    text := upper(trim(p_plate_number));
  v_access_check   jsonb;
  v_client_check   jsonb;
  v_vo_company_id  uuid;
  v_claim_id       uuid;
  v_target_user_id uuid;
  v_vehicle_details jsonb;
BEGIN
  -- ── 1. Resolve caller profile ─────────────────────────────────────────
  SELECT id INTO v_profile_id FROM user_profiles
  WHERE auth_user_id = p_provider_user_id
    AND is_active = true
    AND is_suspended = false;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User profile not found or inactive');
  END IF;

  -- ── 2. Resolve provider + permission check ────────────────────────────
  IF p_provider_id IS NOT NULL THEN
    v_provider_id := p_provider_id;

    SELECT EXISTS (
      SELECT 1 FROM service_providers
      WHERE id = v_provider_id AND owner_user_id = v_profile_id
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
      SELECT EXISTS (
        SELECT 1 FROM service_provider_users
        WHERE service_provider_id = v_provider_id
          AND user_id = v_profile_id AND is_active = true
      ) INTO v_has_spu;

      SELECT EXISTS (
        SELECT 1 FROM mechanics
        WHERE service_provider_id = v_provider_id
          AND user_id = v_profile_id AND is_active = true
      ) INTO v_has_mech;

      IF NOT v_has_spu AND NOT v_has_mech THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are not a member of this service provider');
      END IF;

      SELECT COALESCE(BOOL_OR(spu.can_approve_work), false)
        OR COALESCE((
          SELECT m.can_approve_work FROM mechanics m
          WHERE m.service_provider_id = v_provider_id
            AND m.user_id = v_profile_id AND m.is_active = true LIMIT 1
        ), false)
      INTO v_can_approve
      FROM service_provider_users spu
      WHERE spu.service_provider_id = v_provider_id
        AND spu.user_id = v_profile_id AND spu.is_active = true;

      IF NOT v_can_approve THEN
        SELECT COALESCE(BOOL_OR(can_approve_work), false) INTO v_can_approve
        FROM mechanics
        WHERE service_provider_id = v_provider_id
          AND user_id = v_profile_id AND is_active = true;
      END IF;

      IF NOT v_can_approve THEN
        RETURN jsonb_build_object('success', false, 'error',
          'You need the WO access permission to create walk-in work orders');
      END IF;
    END IF;
  ELSE
    SELECT id INTO v_provider_id FROM service_providers WHERE owner_user_id = v_profile_id;
    IF v_provider_id IS NULL THEN
      SELECT service_provider_id INTO v_provider_id FROM mechanics
      WHERE user_id = v_profile_id AND is_active = true LIMIT 1;
    END IF;
    IF v_provider_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'No associated service provider found');
    END IF;
  END IF;

  -- ── 3. Provider subscription must allow writes ────────────────────────
  v_access_check := _require_provider_write(v_provider_id);
  IF v_access_check IS NOT NULL THEN RETURN v_access_check; END IF;

  -- ── 4. Provider must be verified ──────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM service_providers
    WHERE id = v_provider_id AND status = 'active' AND is_verified = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Provider must be verified before creating work orders.');
  END IF;

  -- ── 5. Client limit guard ─────────────────────────────────────────────
  v_client_check := _guard_client_limit(v_provider_id, NULL);
  IF v_client_check IS NOT NULL THEN RETURN v_client_check; END IF;

  -- ── 6. Shop validation ────────────────────────────────────────────────
  IF p_shop_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM shops WHERE id = p_shop_id AND service_provider_id = v_provider_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Shop does not belong to your provider');
    END IF;
  END IF;

  -- ── 7. Resolve or create vehicle ──────────────────────────────────────
  SELECT id INTO v_vehicle_id FROM vehicles
  WHERE plate_number_idx = pii_hmac_raw(v_plate_upper);

  IF v_vehicle_id IS NULL THEN
    IF p_make IS NULL OR p_model IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Vehicle not found. Please provide make and model to register it.');
    END IF;
    INSERT INTO vehicles (plate_number, make, model, year_of_manufacture, color, vin)
    VALUES (
      v_plate_upper, p_make, p_model, p_year, p_color,
      CASE WHEN p_vin IS NOT NULL AND trim(p_vin) <> '' THEN upper(trim(p_vin)) ELSE NULL END
    ) RETURNING id INTO v_vehicle_id;
  END IF;

  -- ── 8. REMOVED — No ownership creation from work orders ───────────────
  -- Vehicle ownership is now handled via pending_vehicle_claims (step 11b)

  -- ── 9. Company subscription guard (if vehicle is company-owned) ───────
  SELECT vo.owner_company_id INTO v_vo_company_id
  FROM vehicle_ownership vo WHERE vo.vehicle_id = v_vehicle_id;

  IF v_vo_company_id IS NOT NULL THEN
    v_access_check := _require_company_write(v_vo_company_id);
    IF v_access_check IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Cannot create work order — the vehicle owner''s company subscription is inactive.');
    END IF;
  END IF;

  -- ── 10. Create the work order ─────────────────────────────────────────
  SELECT id INTO v_intake_status FROM work_order_statuses WHERE code = 'intake';
  v_seq := nextval('work_order_seq');
  v_wo_number := 'WO-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO work_orders (
    work_order_number, service_provider_id, vehicle_id, shop_id, status_id,
    problem_description, priority, is_walk_in,
    walk_in_owner_name, walk_in_owner_phone, walk_in_owner_email,
    initial_mileage, created_by, opened_at
  ) VALUES (
    v_wo_number, v_provider_id, v_vehicle_id, p_shop_id, v_intake_status,
    p_problem_description, p_priority, true,
    p_walk_in_owner_name, p_walk_in_owner_phone, p_walk_in_owner_email,
    p_initial_mileage, p_provider_user_id, now()
  ) RETURNING id INTO v_wo_id;

  -- ── 11. Walk-in invitation (unregistered owner with email) ────────────
  v_invite_id := NULL;
  v_invite_token := NULL;

  IF p_owner_user_id IS NULL AND p_owner_company_id IS NULL
     AND p_walk_in_owner_email IS NOT NULL AND trim(p_walk_in_owner_email) <> '' THEN

    INSERT INTO wo_walk_in_invitations (
      work_order_id, service_provider_id, vehicle_id,
      invited_email,
      expires_at,
      invited_by_user_id, status
    ) VALUES (
      v_wo_id, v_provider_id, v_vehicle_id,
      p_walk_in_owner_email,
      now() + interval '7 days',
      v_profile_id, 'pending'
    ) RETURNING id, invite_token INTO v_invite_id, v_invite_token;
  END IF;

  -- ── 11b. Pending vehicle claim ────────────────────────────────────────
  v_claim_id := NULL;
  v_target_user_id := NULL;

  -- Build the vehicle details snapshot
  v_vehicle_details := jsonb_build_object(
    'plate_number', v_plate_upper,
    'make',         COALESCE(p_make, ''),
    'model',        COALESCE(p_model, ''),
    'year',         p_year,
    'color',        COALESCE(p_color, ''),
    'vin',          COALESCE(CASE WHEN p_vin IS NOT NULL AND trim(p_vin) <> '' THEN upper(trim(p_vin)) ELSE NULL END, '')
  );

  -- Only create a claim when the vehicle has NO existing ownership
  IF NOT EXISTS (SELECT 1 FROM vehicle_ownership WHERE vehicle_id = v_vehicle_id) THEN

    -- Check if the target email belongs to an existing user
    IF p_walk_in_owner_email IS NOT NULL AND trim(p_walk_in_owner_email) <> '' THEN
      SELECT up.id INTO v_target_user_id
      FROM user_profiles up
      WHERE up.email_idx = pii_hmac_raw(upper(trim(p_walk_in_owner_email)))
      LIMIT 1;
    END IF;

    -- Check if the target is a company (by p_owner_company_id)
    INSERT INTO pending_vehicle_claims (
      walk_in_invitation_id, work_order_id, vehicle_id, service_provider_id,
      target_email, target_user_id, target_company_id,
      vehicle_details, status, expires_at
    ) VALUES (
      v_invite_id, v_wo_id, v_vehicle_id, v_provider_id,
      CASE WHEN p_walk_in_owner_email IS NOT NULL AND trim(p_walk_in_owner_email) <> ''
           THEN p_walk_in_owner_email ELSE NULL END,
      v_target_user_id,
      p_owner_company_id,
      v_vehicle_details,
      'pending',
      COALESCE((SELECT expires_at FROM wo_walk_in_invitations WHERE id = v_invite_id), now() + interval '7 days')
    ) RETURNING id INTO v_claim_id;

    -- If the owner is an existing user, create a notification
    IF v_target_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, reference_table, reference_id)
      VALUES (
        v_target_user_id,
        'vehicle_claim_available',
        'pending_vehicle_claims',
        v_claim_id
      );
    END IF;

  END IF;

  -- ── Done ──────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',              true,
    'work_order_id',        v_wo_id,
    'work_order_number',    v_wo_number,
    'vehicle_id',           v_vehicle_id,
    'service_provider_id',  v_provider_id,
    'initiator_profile_id', v_profile_id,
    'invitation_id',        v_invite_id,
    'invitation_token',     v_invite_token,
    'claim_id',             v_claim_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'RPC create_walk_in_work_order failed: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred. Please try again or contact support.');
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. MODIFY: add_vehicle_with_ownership — add p_claim_id parameter
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_vehicle_with_ownership(
  p_plate_number text,
  p_make text,
  p_model text,
  p_year_of_manufacture integer,
  p_color text,
  p_vin text,
  p_owner_user_id uuid,
  p_claim_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id    uuid;
  v_vehicle_id    uuid;
  v_plate_norm    text;
  v_vin_norm      text;
  v_plate_idx     text;
  v_vin_idx       text;
  v_by_plate      record;
  v_by_vin        record;
  v_reuse         record;
  v_is_reuse      boolean := false;
  v_overrides     text[] := ARRAY[]::text[];
  v_color_changed boolean := false;
  v_plate_changed boolean := false;
  v_limit_check   jsonb;
  v_old_ownership record;
  v_claim         record;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════
  -- CLAIM PATH: link ownership to existing vehicle via pending_vehicle_claims
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_claim_id IS NOT NULL THEN
    SELECT id INTO v_profile_id FROM user_profiles WHERE auth_user_id = auth.uid();
    IF p_owner_user_id <> v_profile_id THEN
      RAISE EXCEPTION 'Unauthorized: can only register vehicles under your own profile';
    END IF;

    -- Look up and validate the claim
    SELECT pvc.* INTO v_claim
    FROM pending_vehicle_claims pvc
    WHERE pvc.id = p_claim_id;

    IF v_claim IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Vehicle claim not found.');
    END IF;
    IF v_claim.status <> 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'This vehicle claim has already been processed.');
    END IF;
    IF v_claim.expires_at < now() THEN
      UPDATE pending_vehicle_claims SET status = 'expired' WHERE id = p_claim_id;
      RETURN jsonb_build_object('success', false, 'error', 'This vehicle claim has expired.');
    END IF;

    -- Verify the claim belongs to this user (by target_user_id or by email)
    IF v_claim.target_user_id IS NOT NULL AND v_claim.target_user_id <> v_profile_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'This vehicle claim is not assigned to you.');
    END IF;
    IF v_claim.target_user_id IS NULL THEN
      -- Match by email
      DECLARE v_user_email_idx text;
      BEGIN
        SELECT up.email_idx INTO v_user_email_idx
        FROM user_profiles up WHERE up.id = v_profile_id;
        IF v_user_email_idx IS DISTINCT FROM v_claim.target_email_idx THEN
          RETURN jsonb_build_object('success', false, 'error', 'This vehicle claim is not assigned to you.');
        END IF;
      END;
    END IF;

    -- Vehicle limit guard
    v_limit_check := check_vehicle_limit(p_owner_user_id);
    IF NOT (v_limit_check->>'can_add')::boolean THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', v_limit_check->>'reason',
        'limit_info', v_limit_check
      );
    END IF;

    v_vehicle_id := v_claim.vehicle_id;

    -- Create ownership on the existing vehicle
    INSERT INTO vehicle_ownership (vehicle_id, owner_user_id)
    VALUES (v_vehicle_id, p_owner_user_id)
    ON CONFLICT (vehicle_id) DO UPDATE
      SET owner_user_id = EXCLUDED.owner_user_id, updated_at = now();

    -- Mark claim as claimed
    UPDATE pending_vehicle_claims
    SET status = 'claimed', claimed_at = now()
    WHERE id = p_claim_id;

    -- Also update the walk-in invitation if linked
    IF v_claim.walk_in_invitation_id IS NOT NULL THEN
      UPDATE wo_walk_in_invitations
      SET status = 'registered',
          claimed_by_user_id = v_profile_id,
          claimed_at = now()
      WHERE id = v_claim.walk_in_invitation_id
        AND status = 'pending';
    END IF;

    RETURN jsonb_build_object(
      'success',     true,
      'vehicle_id',  v_vehicle_id,
      'reactivated', false,
      'claimed',     true,
      'claim_id',    p_claim_id,
      'immutable_overrides', ARRAY[]::text[],
      'limit_info',  v_limit_check
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- NORMAL PATH: existing flow unchanged
  -- ═══════════════════════════════════════════════════════════════════════
  v_plate_norm := nullif(upper(regexp_replace(trim(p_plate_number), '\s+', '', 'g')), '');
  v_vin_norm   := nullif(upper(regexp_replace(trim(p_vin), '\s+', '', 'g')), '');

  IF v_plate_norm IS NULL THEN RAISE EXCEPTION 'Plate number is required'; END IF;
  IF v_vin_norm IS NULL THEN RAISE EXCEPTION 'VIN is required'; END IF;

  SELECT id INTO v_profile_id FROM user_profiles WHERE auth_user_id = auth.uid();
  IF p_owner_user_id <> v_profile_id THEN
    RAISE EXCEPTION 'Unauthorized: can only register vehicles under your own profile';
  END IF;

  v_limit_check := check_vehicle_limit(p_owner_user_id);
  IF NOT (v_limit_check->>'can_add')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', v_limit_check->>'reason',
      'limit_info', v_limit_check
    );
  END IF;

  v_plate_idx := pii_hmac_raw(v_plate_norm);
  v_vin_idx   := pii_hmac_raw(v_vin_norm);

  SELECT id, is_active,
         pii_decrypt(plate_number_enc) AS plate_number,
         make, model, year_of_manufacture, color,
         pii_decrypt(vin_enc) AS vin
    INTO v_by_plate
  FROM vehicles WHERE plate_number_idx = v_plate_idx LIMIT 1;

  SELECT id, is_active,
         pii_decrypt(plate_number_enc) AS plate_number,
         make, model, year_of_manufacture, color,
         pii_decrypt(vin_enc) AS vin
    INTO v_by_vin
  FROM vehicles WHERE vin_idx = v_vin_idx LIMIT 1;

  IF v_by_plate.id IS NOT NULL AND v_by_plate.is_active = true THEN
    RAISE EXCEPTION 'A vehicle with this plate number is already registered and active';
  END IF;
  IF v_by_vin.id IS NOT NULL AND v_by_vin.is_active = true THEN
    RAISE EXCEPTION 'A vehicle with this VIN is already registered and active';
  END IF;

  IF v_by_vin.id IS NOT NULL THEN
    v_reuse := v_by_vin;
    v_is_reuse := true;
    IF v_by_plate.id IS NOT NULL AND v_by_plate.id <> v_by_vin.id THEN
      RAISE EXCEPTION
        'Cannot register: the plate number you entered is already on file '
        'against a different vehicle (by VIN). If you have reused this '
        'plate on a new car, please contact support to release it. '
        'Otherwise verify the plate number and try again.';
    END IF;
  ELSIF v_by_plate.id IS NOT NULL THEN
    v_reuse := v_by_plate;
    v_is_reuse := true;
  END IF;

  -- ═══ Reactivation path ═══
  IF v_is_reuse THEN
    v_vehicle_id := v_reuse.id;

    IF v_reuse.make <> p_make THEN v_overrides := array_append(v_overrides, 'make'); END IF;
    IF v_reuse.model <> p_model THEN v_overrides := array_append(v_overrides, 'model'); END IF;
    IF v_reuse.year_of_manufacture IS DISTINCT FROM p_year_of_manufacture THEN
      v_overrides := array_append(v_overrides, 'year_of_manufacture');
    END IF;

    IF p_color IS NOT NULL AND v_reuse.color IS DISTINCT FROM p_color THEN
      v_color_changed := true;
    END IF;

    IF v_reuse.plate_number IS DISTINCT FROM v_plate_norm THEN
      IF v_by_plate.id IS NULL OR v_by_plate.id = v_reuse.id THEN
        v_plate_changed := true;
      END IF;
    END IF;

    SELECT owner_user_id, owner_company_id
      INTO v_old_ownership
    FROM vehicle_ownership
    WHERE vehicle_id = v_vehicle_id;

    IF FOUND THEN
      INSERT INTO vehicle_ownership_history (
        vehicle_id, owner_user_id, owner_company_id, owned_from, owned_until
      ) VALUES (
        v_vehicle_id,
        v_old_ownership.owner_user_id,
        v_old_ownership.owner_company_id,
        (SELECT COALESCE(updated_at, created_at) FROM vehicles WHERE id = v_vehicle_id),
        now()
      );
    END IF;

    DELETE FROM vehicle_ownership WHERE vehicle_id = v_vehicle_id;
    INSERT INTO vehicle_ownership (vehicle_id, owner_user_id)
    VALUES (v_vehicle_id, p_owner_user_id);

    UPDATE vehicles SET
      is_active      = true,
      deactivated_at = NULL,
      deactivated_by = NULL,
      color          = CASE WHEN v_color_changed THEN p_color ELSE color END,
      plate_number   = CASE WHEN v_plate_changed THEN v_plate_norm ELSE NULL END,
      updated_at     = now()
    WHERE id = v_vehicle_id;

    RETURN jsonb_build_object(
      'success', true,
      'vehicle_id', v_vehicle_id,
      'reactivated', true,
      'immutable_overrides', v_overrides,
      'limit_info', v_limit_check
    );
  END IF;

  -- ═══ New vehicle path ═══
  INSERT INTO vehicles (plate_number, make, model, year_of_manufacture, color, vin)
  VALUES (v_plate_norm, p_make, p_model, p_year_of_manufacture, p_color, v_vin_norm)
  RETURNING id INTO v_vehicle_id;

  INSERT INTO vehicle_ownership (vehicle_id, owner_user_id)
  VALUES (v_vehicle_id, p_owner_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'vehicle_id', v_vehicle_id,
    'reactivated', false,
    'immutable_overrides', ARRAY[]::text[],
    'limit_info', v_limit_check
  );

EXCEPTION
  WHEN raise_exception THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  WHEN OTHERS THEN
    RAISE WARNING 'RPC add_vehicle_with_ownership failed: %', SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred. Please try again or contact support.');
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. MODIFY: handle_new_user trigger
--    After creating profile, check pending_vehicle_claims by email and
--    set target_user_id + create notification
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_profile_id uuid;
  v_email_idx      text;
  v_claim          record;
BEGIN
  INSERT INTO public.user_profiles (
    auth_user_id, first_name, last_name, email, phone, is_active
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, ''),
    true
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    email      = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, user_profiles.first_name),
    last_name  = COALESCE(EXCLUDED.last_name, user_profiles.last_name),
    phone      = COALESCE(EXCLUDED.phone, user_profiles.phone),
    updated_at = now()
  RETURNING id INTO v_new_profile_id;

  -- ── Check for pending vehicle claims matching this email ──────────────
  IF NEW.email IS NOT NULL AND v_new_profile_id IS NOT NULL THEN
    v_email_idx := pii_hmac_raw(upper(trim(NEW.email)));

    FOR v_claim IN
      SELECT id FROM pending_vehicle_claims
      WHERE target_email_idx = v_email_idx
        AND target_user_id IS NULL
        AND status = 'pending'
        AND expires_at > now()
    LOOP
      -- Link the claim to the new user
      UPDATE pending_vehicle_claims
      SET target_user_id = v_new_profile_id
      WHERE id = v_claim.id;

      -- Create notification
      INSERT INTO notifications (user_id, type, reference_table, reference_id)
      VALUES (v_new_profile_id, 'vehicle_claim_available', 'pending_vehicle_claims', v_claim.id);
    END LOOP;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user error for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. MODIFY: expire_old_invitations — also expire pending_vehicle_claims
-- ────────────────────────────────────────────────────────────────────────────
-- Note: If this function doesn't exist, create it. If it does, we replace it.
CREATE OR REPLACE FUNCTION public.expire_old_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Expire walk-in invitations
  UPDATE wo_walk_in_invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();

  -- Expire pending vehicle claims
  UPDATE pending_vehicle_claims
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. MODIFY: add_fleet_vehicle_with_ownership — add p_claim_id parameter
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_fleet_vehicle_with_ownership(
  p_plate_number text,
  p_make text,
  p_model text,
  p_year_of_manufacture integer,
  p_color text,
  p_vin text,
  p_mileage integer,
  p_owner_user_id uuid,
  p_owner_company_id uuid,
  p_claim_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_authorized boolean := false;
  v_profile_id    uuid;
  v_vehicle_id    uuid;
  v_plate_norm    text;
  v_vin_norm      text;
  v_plate_idx     text;
  v_vin_idx       text;
  v_by_plate      record;
  v_by_vin        record;
  v_reuse         record;
  v_is_reuse      boolean := false;
  v_overrides     text[] := ARRAY[]::text[];
  v_color_changed boolean := false;
  v_plate_changed boolean := false;
  v_access_check  jsonb;
  v_access_info   jsonb;
  v_old_ownership record;
  v_claim         record;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════
  -- CLAIM PATH: link company ownership to existing vehicle
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_claim_id IS NOT NULL THEN
    SELECT id INTO v_profile_id FROM user_profiles WHERE auth_user_id = auth.uid();

    -- Authorization check
    SELECT EXISTS (
      SELECT 1 FROM company_profiles
      WHERE id = p_owner_company_id AND owner_user_id = v_profile_id
      UNION ALL
      SELECT 1 FROM company_users
      WHERE company_id = p_owner_company_id
        AND user_id    = v_profile_id
        AND is_active  = true
        AND (is_admin = true OR can_manage_fleet = true)
    ) INTO v_is_authorized;

    IF NOT v_is_authorized THEN
      RAISE EXCEPTION 'Unauthorized: user lacks fleet-management permission for this company';
    END IF;

    -- Look up and validate the claim
    SELECT pvc.* INTO v_claim
    FROM pending_vehicle_claims pvc
    WHERE pvc.id = p_claim_id;

    IF v_claim IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Vehicle claim not found.');
    END IF;
    IF v_claim.status <> 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'This vehicle claim has already been processed.');
    END IF;
    IF v_claim.expires_at < now() THEN
      UPDATE pending_vehicle_claims SET status = 'expired' WHERE id = p_claim_id;
      RETURN jsonb_build_object('success', false, 'error', 'This vehicle claim has expired.');
    END IF;

    -- Verify the claim targets this company
    IF v_claim.target_company_id IS NOT NULL AND v_claim.target_company_id <> p_owner_company_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'This vehicle claim is not assigned to your company.');
    END IF;

    -- Subscription guard
    v_access_check := _require_company_write(p_owner_company_id);
    IF v_access_check IS NOT NULL THEN RETURN v_access_check; END IF;

    -- Vehicle limit guard
    v_access_info := check_company_access(p_owner_company_id);
    IF NOT COALESCE((v_access_info->>'can_add_vehicle')::boolean, false) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Vehicle limit reached on your current plan.',
        'limit_info', v_access_info
      );
    END IF;

    v_vehicle_id := v_claim.vehicle_id;

    -- Create company ownership on existing vehicle
    INSERT INTO vehicle_ownership (vehicle_id, owner_company_id)
    VALUES (v_vehicle_id, p_owner_company_id)
    ON CONFLICT (vehicle_id) DO UPDATE
      SET owner_company_id = EXCLUDED.owner_company_id, updated_at = now();

    -- Record initial mileage if provided
    IF p_mileage IS NOT NULL THEN
      INSERT INTO vehicle_history (vehicle_id, mileage, event_type, description, recorded_at)
      VALUES (v_vehicle_id, p_mileage, 'mileage_recorded',
              'Initial mileage at fleet registration via claim', now());
    END IF;

    -- Mark claim as claimed
    UPDATE pending_vehicle_claims
    SET status = 'claimed', claimed_at = now()
    WHERE id = p_claim_id;

    -- Also update the walk-in invitation if linked
    IF v_claim.walk_in_invitation_id IS NOT NULL THEN
      UPDATE wo_walk_in_invitations
      SET status = 'registered',
          claimed_by_user_id = v_profile_id,
          claimed_at = now()
      WHERE id = v_claim.walk_in_invitation_id
        AND status = 'pending';
    END IF;

    RETURN jsonb_build_object(
      'success',             true,
      'vehicle_id',          v_vehicle_id,
      'reactivated',         false,
      'claimed',             true,
      'claim_id',            p_claim_id,
      'immutable_overrides', '[]'::jsonb,
      'limit_info',          v_access_info
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- NORMAL PATH: existing flow unchanged
  -- ═══════════════════════════════════════════════════════════════════════
  v_plate_norm := nullif(upper(regexp_replace(trim(p_plate_number), '\s+', '', 'g')), '');
  v_vin_norm   := nullif(upper(regexp_replace(trim(p_vin), '\s+', '', 'g')), '');

  IF v_plate_norm IS NULL THEN RAISE EXCEPTION 'Plate number is required'; END IF;
  IF v_vin_norm IS NULL THEN RAISE EXCEPTION 'VIN is required'; END IF;

  SELECT id INTO v_profile_id FROM user_profiles WHERE auth_user_id = auth.uid();

  SELECT EXISTS (
    SELECT 1 FROM company_profiles
    WHERE id = p_owner_company_id AND owner_user_id = p_owner_user_id
    UNION ALL
    SELECT 1 FROM company_users
    WHERE company_id = p_owner_company_id
      AND user_id    = p_owner_user_id
      AND is_active  = true
      AND (is_admin = true OR can_manage_fleet = true)
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: user lacks fleet-management permission for this company';
  END IF;

  -- Subscription guard
  v_access_check := _require_company_write(p_owner_company_id);
  IF v_access_check IS NOT NULL THEN RETURN v_access_check; END IF;

  -- Vehicle limit guard
  v_access_info := check_company_access(p_owner_company_id);
  IF NOT COALESCE((v_access_info->>'can_add_vehicle')::boolean, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Vehicle limit reached. '
        || COALESCE((v_access_info->>'current_vehicles')::text, '?')
        || ' of '
        || COALESCE((v_access_info->>'max_vehicles')::text, '?')
        || ' vehicles used on your '
        || COALESCE(v_access_info->>'plan_name', 'current')
        || ' plan.',
      'limit_info', v_access_info
    );
  END IF;

  -- Duplicate check via HMAC indexes
  v_plate_idx := pii_hmac_raw(v_plate_norm);
  v_vin_idx   := pii_hmac_raw(v_vin_norm);

  SELECT id, is_active,
         pii_decrypt(plate_number_enc) AS plate_number,
         make, model, year_of_manufacture, color,
         pii_decrypt(vin_enc) AS vin
    INTO v_by_plate
  FROM vehicles WHERE plate_number_idx = v_plate_idx LIMIT 1;

  SELECT id, is_active,
         pii_decrypt(plate_number_enc) AS plate_number,
         make, model, year_of_manufacture, color,
         pii_decrypt(vin_enc) AS vin
    INTO v_by_vin
  FROM vehicles WHERE vin_idx = v_vin_idx LIMIT 1;

  IF v_by_plate.id IS NOT NULL AND v_by_plate.is_active = true THEN
    RAISE EXCEPTION 'A vehicle with this plate number is already registered and active';
  END IF;
  IF v_by_vin.id IS NOT NULL AND v_by_vin.is_active = true THEN
    RAISE EXCEPTION 'A vehicle with this VIN is already registered and active';
  END IF;

  IF v_by_vin.id IS NOT NULL THEN
    v_reuse := v_by_vin;
    v_is_reuse := true;
    IF v_by_plate.id IS NOT NULL AND v_by_plate.id <> v_by_vin.id THEN
      RAISE EXCEPTION
        'Cannot register: the plate number you entered is already on file '
        'against a different vehicle (by VIN). If you have reused this '
        'plate on a new car, please contact support to release it. '
        'Otherwise verify the plate number and try again.';
    END IF;
  ELSIF v_by_plate.id IS NOT NULL THEN
    RAISE EXCEPTION
      'This plate number was previously used by a different vehicle '
      '(different VIN). Please verify the VIN you entered — if it is '
      'correct and the previous plate has been re-issued to this car, '
      'contact support to release the old record.';
  END IF;

  -- ═══ Reactivation path ═══
  IF v_is_reuse THEN
    SELECT owner_user_id, owner_company_id
      INTO v_old_ownership
    FROM vehicle_ownership
    WHERE vehicle_id = v_reuse.id;

    IF FOUND THEN
      INSERT INTO vehicle_ownership_history (
        vehicle_id, owner_user_id, owner_company_id, owned_from, owned_until
      ) VALUES (
        v_reuse.id,
        v_old_ownership.owner_user_id,
        v_old_ownership.owner_company_id,
        (SELECT COALESCE(updated_at, created_at) FROM vehicles WHERE id = v_reuse.id),
        now()
      );
    END IF;

    DELETE FROM vehicle_ownership WHERE vehicle_id = v_reuse.id;

    IF p_make IS NOT NULL AND v_reuse.make IS NOT NULL
       AND lower(trim(p_make)) <> lower(trim(v_reuse.make))           THEN v_overrides := array_append(v_overrides, 'make'); END IF;
    IF p_model IS NOT NULL AND v_reuse.model IS NOT NULL
       AND lower(trim(p_model)) <> lower(trim(v_reuse.model))         THEN v_overrides := array_append(v_overrides, 'model'); END IF;
    IF p_year_of_manufacture IS NOT NULL AND v_reuse.year_of_manufacture IS NOT NULL
       AND p_year_of_manufacture <> v_reuse.year_of_manufacture       THEN v_overrides := array_append(v_overrides, 'year_of_manufacture'); END IF;

    v_color_changed := (
      coalesce(lower(trim(p_color)), '') <> coalesce(lower(trim(v_reuse.color)), '')
    );
    v_plate_changed := (v_plate_norm <> v_reuse.plate_number);

    UPDATE vehicles SET
      plate_number   = v_plate_norm,
      color          = p_color,
      is_active      = true,
      deactivated_at = NULL,
      deactivated_by = NULL,
      updated_at     = now(),
      updated_by     = auth.uid()
    WHERE id = v_reuse.id;

    INSERT INTO vehicle_ownership (vehicle_id, owner_company_id)
    VALUES (v_reuse.id, p_owner_company_id);

    IF v_color_changed AND p_color IS NOT NULL THEN
      INSERT INTO vehicle_color_history (vehicle_id, color, changed_by)
      VALUES (v_reuse.id, p_color, v_profile_id);
    END IF;

    IF v_plate_changed THEN
      INSERT INTO vehicle_plate_history (vehicle_id, plate_number, changed_by)
      VALUES (v_reuse.id, v_plate_norm, v_profile_id);
    END IF;

    IF p_mileage IS NOT NULL THEN
      INSERT INTO vehicle_history (vehicle_id, mileage, event_type, description, recorded_at)
      VALUES (v_reuse.id, p_mileage, 'mileage_recorded',
              'Initial mileage on re-registration', now());
    END IF;

    RETURN jsonb_build_object(
      'success',             true,
      'vehicle_id',          v_reuse.id,
      'reactivated',         true,
      'immutable_overrides', to_jsonb(v_overrides),
      'limit_info',          v_access_info
    );
  END IF;

  -- ═══ New vehicle path ═══
  INSERT INTO vehicles (
    plate_number, make, model, year_of_manufacture, color, vin, updated_by
  ) VALUES (
    v_plate_norm, p_make, p_model, p_year_of_manufacture, p_color, v_vin_norm, auth.uid()
  )
  RETURNING id INTO v_vehicle_id;

  INSERT INTO vehicle_ownership (vehicle_id, owner_company_id)
  VALUES (v_vehicle_id, p_owner_company_id);

  IF p_color IS NOT NULL THEN
    INSERT INTO vehicle_color_history (vehicle_id, color, changed_by)
    VALUES (v_vehicle_id, p_color, v_profile_id);
  END IF;

  INSERT INTO vehicle_plate_history (vehicle_id, plate_number, changed_by)
  VALUES (v_vehicle_id, v_plate_norm, v_profile_id);

  IF p_mileage IS NOT NULL THEN
    INSERT INTO vehicle_history (vehicle_id, mileage, event_type, description, recorded_at)
    VALUES (v_vehicle_id, p_mileage, 'mileage_recorded',
            'Initial mileage at fleet registration', now());
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'vehicle_id',          v_vehicle_id,
    'reactivated',         false,
    'immutable_overrides', '[]'::jsonb,
    'limit_info',          v_access_info
  );

EXCEPTION
  WHEN raise_exception THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  WHEN OTHERS THEN
    RAISE WARNING 'RPC add_fleet_vehicle_with_ownership failed: %', SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred. Please try again or contact support.');
END;
$function$;
