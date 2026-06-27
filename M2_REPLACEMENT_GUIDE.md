# M2 Admin Mutations — Replacement Guide

## New Files
- `src/app/api/admin/mutations/route.js` — server-side mutation endpoint
- `src/lib/admin-mutations.js` — client-side helper

## How It Works

All admin writes go through `/api/admin/mutations` which:
1. Verifies admin auth **server-side** (calls `is_user_admin()` RPC, not middleware)
2. Checks the table+operation against a strict whitelist
3. Executes the mutation
4. Auto-logs to `admin_action_logs` (except when writing to the log itself)

## Replacements by File

Add this import to each file:
```js
import { adminInsert, adminUpdate, adminLog } from '@/lib/admin-mutations'
```

---

### admin/companies/[id]/page.js (3 action logs)

```js
// Before (3 locations):
await supabase.from('admin_action_logs').insert({
  admin_user_id: adminProfile.id,
  action_type:   'approve_company',
  target_type:   'company',
  target_id:     company.id,
})

// After:
await adminLog('approve_company', 'company', company.id)
// (admin_user_id is set server-side, no need to pass it)
```

Same pattern for `reject_company` and `request_company_info` action types.

---

### admin/companies/page.js (1 action log)

```js
// Before:
await supabase.from('admin_action_logs').insert({
  admin_user_id: adminProfile.id,
  action_type:   'company_' + action,
  target_type:   'company',
  target_id:     companyId,
})

// After:
await adminLog('company_' + action, 'company', companyId)
```

---

### admin/providers/[id]/page.js (3 action logs + 1 rejection)

```js
// Action logs — same pattern:
await adminLog('approve_provider', 'service_provider', provider.id)
await adminLog('reject_provider', 'service_provider', provider.id)
await adminLog('request_provider_info', 'service_provider', provider.id)

// Before (provider_rejections):
await supabase.from('provider_rejections').insert({
  service_provider_id: provider.id,
  rejected_by: adminProfile.id,
  rejection_reason: rejectionReason,
})

// After:
await adminInsert('provider_rejections', {
  service_provider_id: provider.id,
  rejected_by: adminProfile.id, // still needed as a data field
  rejection_reason: rejectionReason,
})
```

---

### admin/settings/page.js — LookupTable component

The `LookupTable` component currently receives `supabase` as a prop and calls
`.from(tableName).insert(...)` / `.update(...)` directly. Replace the mutation
calls inside the component:

```js
// Before (insert, ~line 102):
const { error: e } = await supabase.from(tableName).insert(insert)

// After:
const { error: e } = await adminInsert(tableName, insert)

// Before (update, ~line 72):
const { error: e } = await supabase.from(tableName).update(update).eq('id', editId)

// After:
const { error: e } = await adminUpdate(tableName, editId, update)

// Before (toggle, ~line 117):
.from(tableName).update({ [field]: !row[field] }).eq('id', row.id)

// After:
await adminUpdate(tableName, row.id, { [field]: !row[field] })
```

The `supabase` prop is still needed for the SELECT queries (reads stay client-side,
only writes go through the API).

**platform_settings update (~line 1129):**
```js
// Before:
await supabase.from('platform_settings')
  .update({ setting_value: data, updated_at: new Date().toISOString() })
  .eq('setting_key', key)

// After:
await adminUpdate('platform_settings', null,
  { setting_value: data, updated_at: new Date().toISOString() },
  { setting_key: key }  // filter instead of id
)
```

---

### admin/subscriptions/page.js

```js
// Before (pricing tier update):
await supabase.from('subscription_pricing_tiers').update(update).eq('id', editId)
// After:
await adminUpdate('subscription_pricing_tiers', editId, update)

// Before (pricing tier insert):
await supabase.from('subscription_pricing_tiers').insert(row)
// After:
await adminInsert('subscription_pricing_tiers', row)

// Before (package update):
await supabase.from('subscription_packages').update({...}).eq('id', pkg.id)
// After:
await adminUpdate('subscription_packages', pkg.id, {...})

// Before (shop tier update):
await supabase.from('subscription_shop_tiers').update({...}).eq('id', tier.id)
// After:
await adminUpdate('subscription_shop_tiers', tier.id, {...})

// Before (trial config update):
await supabase.from('subscription_trial_config').update({...}).eq('id', config.id)
// After:
await adminUpdate('subscription_trial_config', config.id, {...})
```

---

### admin/support/page.js

```js
// Before:
await supabase.from('support_ticket_messages').insert({
  ticket_id: ticketId, sender_id: profileId, is_admin: true,
  message: adminReply.trim(),
})

// After:
await adminInsert('support_ticket_messages', {
  ticket_id: ticketId, sender_id: profileId, is_admin: true,
  message: adminReply.trim(),
})
```

---

## What Stays Client-Side

- All **SELECT** queries (reads) — these are already protected by `is_user_admin()` RLS
- All **RPC** calls — these are already SECURITY DEFINER functions with admin checks
- Only **INSERT** and **UPDATE** operations move to the API route

## Why Not DELETE?

No admin page currently does client-side deletes. If needed in the future,
add `'delete'` to the allowed operations in the whitelist and handle it
in the API route.
