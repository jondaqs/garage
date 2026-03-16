-- ================================================
-- BOOKING SYSTEM - RLS POLICIES
-- ================================================
-- Path: Run in Supabase SQL Editor
-- ================================================

-- ================================================
-- 1. Add Booking Statuses (if not exist)
-- ================================================

INSERT INTO booking_statuses (code, display_name, sort_order, color_code, is_active) VALUES
('pending', 'Pending Confirmation', 1, '#FFA500', true),
('confirmed', 'Confirmed', 2, '#0000FF', true),
('in_progress', 'In Progress', 3, '#800080', true),
('completed', 'Completed', 4, '#008000', true),
('cancelled', 'Cancelled', 5, '#FF0000', true)
ON CONFLICT (code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  color_code = EXCLUDED.color_code;

-- ================================================
-- 2. BOOKINGS Table - RLS Policies
-- ================================================

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- SELECT: Customers see their bookings, providers see their bookings, admins see all
DROP POLICY IF EXISTS "allow_read_bookings" ON bookings;
CREATE POLICY "allow_read_bookings"
ON bookings FOR SELECT
TO authenticated
USING (
  -- Customer can see their own bookings
  customer_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
  OR
  -- Provider can see bookings for their service
  service_provider_id IN (
    SELECT sp.id FROM service_providers sp
    WHERE sp.owner_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
  )
  OR
  -- Admins can see all
  is_user_admin()
);

-- INSERT: Customers can create bookings
DROP POLICY IF EXISTS "allow_insert_bookings" ON bookings;
CREATE POLICY "allow_insert_bookings"
ON bookings FOR INSERT
TO authenticated
WITH CHECK (
  customer_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
);

-- UPDATE: Customers and providers can update their bookings
DROP POLICY IF EXISTS "allow_update_bookings" ON bookings;
CREATE POLICY "allow_update_bookings"
ON bookings FOR UPDATE
TO authenticated
USING (
  customer_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
  OR
  service_provider_id IN (
    SELECT sp.id FROM service_providers sp
    WHERE sp.owner_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
  )
  OR
  is_user_admin()
);

-- ================================================
-- 3. BOOKING_STATUSES - Everyone can read
-- ================================================

ALTER TABLE booking_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read_booking_statuses" ON booking_statuses;
CREATE POLICY "allow_read_booking_statuses"
ON booking_statuses FOR SELECT
TO authenticated
USING (true);

-- ================================================
-- 4. BOOKING_SERVICES - RLS Policies
-- ================================================

ALTER TABLE booking_services ENABLE ROW LEVEL SECURITY;

-- SELECT: Can see services for bookings they can see
DROP POLICY IF EXISTS "allow_read_booking_services" ON booking_services;
CREATE POLICY "allow_read_booking_services"
ON booking_services FOR SELECT
TO authenticated
USING (
  booking_id IN (
    SELECT id FROM bookings
    WHERE customer_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
    OR service_provider_id IN (
      SELECT sp.id FROM service_providers sp
      WHERE sp.owner_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
    )
  )
  OR is_user_admin()
);

-- INSERT: Can add services to their bookings
DROP POLICY IF EXISTS "allow_insert_booking_services" ON booking_services;
CREATE POLICY "allow_insert_booking_services"
ON booking_services FOR INSERT
TO authenticated
WITH CHECK (
  booking_id IN (
    SELECT id FROM bookings
    WHERE customer_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
  )
);

-- ================================================
-- 5. BOOKING_HISTORY - RLS Policies
-- ================================================

ALTER TABLE booking_history ENABLE ROW LEVEL SECURITY;

-- SELECT: Can see history for bookings they can see
DROP POLICY IF EXISTS "allow_read_booking_history" ON booking_history;
CREATE POLICY "allow_read_booking_history"
ON booking_history FOR SELECT
TO authenticated
USING (
  booking_id IN (
    SELECT id FROM bookings
    WHERE customer_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
    OR service_provider_id IN (
      SELECT sp.id FROM service_providers sp
      WHERE sp.owner_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
    )
  )
  OR is_user_admin()
);

-- INSERT: System can create history records
DROP POLICY IF EXISTS "allow_insert_booking_history" ON booking_history;
CREATE POLICY "allow_insert_booking_history"
ON booking_history FOR INSERT
TO authenticated
WITH CHECK (true);

-- ================================================
-- 6. BOOKING_MESSAGES - RLS Policies
-- ================================================

ALTER TABLE booking_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: Can see messages for their bookings
DROP POLICY IF EXISTS "allow_read_booking_messages" ON booking_messages;
CREATE POLICY "allow_read_booking_messages"
ON booking_messages FOR SELECT
TO authenticated
USING (
  booking_id IN (
    SELECT id FROM bookings
    WHERE customer_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
    OR service_provider_id IN (
      SELECT sp.id FROM service_providers sp
      WHERE sp.owner_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
    )
  )
  OR is_user_admin()
);

-- INSERT: Can send messages for their bookings
DROP POLICY IF EXISTS "allow_insert_booking_messages" ON booking_messages;
CREATE POLICY "allow_insert_booking_messages"
ON booking_messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
  AND
  booking_id IN (
    SELECT id FROM bookings
    WHERE customer_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
    OR service_provider_id IN (
      SELECT sp.id FROM service_providers sp
      WHERE sp.owner_user_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())
    )
  )
);

-- ================================================
-- VERIFICATION
-- ================================================

DO $$
DECLARE
  booking_policies int;
  status_policies int;
BEGIN
  SELECT COUNT(*) INTO booking_policies
  FROM pg_policies
  WHERE tablename = 'bookings';

  SELECT COUNT(*) INTO status_policies
  FROM pg_policies
  WHERE tablename = 'booking_statuses';

  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════════╗';
  RAISE NOTICE '║   BOOKING SYSTEM RLS - CONFIGURED!             ║';
  RAISE NOTICE '╚════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Booking Statuses Added:';
  RAISE NOTICE '   • pending';
  RAISE NOTICE '   • confirmed';
  RAISE NOTICE '   • in_progress';
  RAISE NOTICE '   • completed';
  RAISE NOTICE '   • cancelled';
  RAISE NOTICE '';
  RAISE NOTICE '✅ RLS Policies Created:';
  RAISE NOTICE '   • bookings (% policies)', booking_policies;
  RAISE NOTICE '   • booking_statuses (% policies)', status_policies;
  RAISE NOTICE '   • booking_services';
  RAISE NOTICE '   • booking_history';
  RAISE NOTICE '   • booking_messages';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Access Rules:';
  RAISE NOTICE '   • Customers: See own bookings';
  RAISE NOTICE '   • Providers: See their service bookings';
  RAISE NOTICE '   • Admins: See all bookings';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Ready to use booking system!';
  RAISE NOTICE '';
  RAISE NOTICE '╚════════════════════════════════════════════════╝';
END $$;
