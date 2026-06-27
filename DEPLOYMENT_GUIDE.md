# App Code Changes — Deployment Guide

## Files Changed (5 files)

### Priority 1: Deploy with Phase 1 SQL
These must go out simultaneously with or immediately after `phase_1_critical.sql`.

| File | Fixes | Why Urgent |
|------|-------|------------|
| `src/app/api/auth/callback/google/route.js` | C2 | Without this, new Google Calendar connections write tokens back to `user_profiles`, re-opening the exposure |
| `src/components/calendar/GoogleCalendarSync.jsx` | C2 | Reads/writes tokens from `user_oauth_tokens` instead of `user_profiles` |

### Priority 2: Deploy with Phase 1 SQL
These align with Phase 1 policy changes. The old code will fail after `phase_1_critical.sql` drops the dangerous policies.

| File | Fixes | Why |
|------|-------|-----|
| `src/app/api/company/team/respond-invitation/route.js` | C3 | Uses `accept_company_invitation` RPC. Old code fails after `insert_own_record` policy is dropped. |

### Priority 3: Deploy with Phase 3 SQL
These use the RPCs created in `phase_3_architecture.sql`.

| File | Fixes | Why |
|------|-------|-----|
| `src/components/provider-registration/steps/ReviewSubmitStep.js` | C1, M1 | Uses `register_service_provider` RPC. Old code fails after `user_roles` INSERT policy is dropped (Phase 1). **Deploy after Phase 1 SQL.** |
| `src/app/api/company/register/route.js` | C1, M1 | Uses `register_company` RPC. Old code fails for role assignment after Phase 1. **Deploy after Phase 3 SQL.** |

### Priority 4: Deploy anytime
| File | Fixes | Why |
|------|-------|-----|
| `src/app/api/team/search-users/route.js` | M3 | Replaces broken `auth.admin.listUsers()` with `user_profiles_secure` search. Independent of SQL migrations. |

## Deployment Order

```
1. Run phase_1_critical.sql in Supabase SQL Editor
2. Deploy Priority 1 + 2 app code (Google Calendar + invitation route)
3. Deploy ReviewSubmitStep.js (uses assign_registration_role RPC from Phase 1)
4. Run phase_2_high_priority.sql
5. Run phase_3_architecture.sql
6. Deploy company register route (uses register_company RPC from Phase 3)
7. Deploy search-users fix (anytime)
8. Run phase_4_hardening.sql
```

## What About the Notification RPC? (H1)

The `create_notification` RPC is created in Phase 2, but 30+ files still do
direct `.from('notifications').insert(...)`. After Phase 2 drops the open INSERT
policy, only service_role inserts work — meaning:

- **API routes** (server-side, using anon-key client): These will FAIL for
  notification inserts after Phase 2. They need to switch to the RPC or use
  a service_role client for the notification insert.
- **Client-side** notification inserts: These will FAIL after Phase 2.

**Recommended approach:** Before running Phase 2, do a bulk find-and-replace
across the codebase:

```js
// Before (30+ locations):
await supabase.from('notifications').insert([{
  recipient_type: 'admin',
  notification_type: 'some_type',
  title: 'Title',
  message: 'Message',
  reference_id: someId,
  reference_type: 'some_type'
}])

// After:
await supabase.rpc('create_notification', {
  p_recipient_user_id: null,  // null for admin notifications
  p_notification_type: 'some_type',
  p_title: 'Title',
  p_message: 'Message',
  p_reference_id: someId,
  p_reference_type: 'some_type',
  p_recipient_type: 'admin'   // 'admin' for admin notifications
})

// For user-targeted notifications:
await supabase.rpc('create_notification', {
  p_recipient_user_id: userId,
  p_notification_type: 'some_type',
  p_title: 'Title',
  p_message: 'Message',
  p_reference_id: someId,
  p_reference_type: 'some_type',
  p_recipient_type: null
})
```

This is the largest refactor and should be done as a separate PR before Phase 2.
