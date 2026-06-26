// src/lib/admin/permissions.js
// Central permission matrix for admin sub-roles.
// Import this wherever you need to check what an admin can do.
//
// UPDATED: Added manage_subscriptions permission

export const ADMIN_ROLES = {
  platform_admin: {
    code: 'platform_admin',
    label: 'System Administrator',
    description: 'Full platform access. Can manage all admins and system settings.',
    color: 'bg-red-100 text-red-800',
    level: 100,
  },
  admin: {
    code: 'admin',
    label: 'Administrator',
    description: 'Full operational access. Can approve, reject, suspend providers, companies, and users.',
    color: 'bg-purple-100 text-purple-800',
    level: 80,
  },
  moderator: {
    code: 'moderator',
    label: 'Moderator',
    description: 'Can review and approve or reject providers and companies. Cannot suspend accounts.',
    color: 'bg-blue-100 text-blue-800',
    level: 60,
  },
  support: {
    code: 'support',
    label: 'Support Agent',
    description: 'Read-only access to users and providers. Can view email queue and respond to feedback.',
    color: 'bg-green-100 text-green-800',
    level: 40,
  },
  reviewer: {
    code: 'reviewer',
    label: 'Reviewer',
    description: 'Can only review pending provider and company applications.',
    color: 'bg-yellow-100 text-yellow-800',
    level: 20,
  },
}

// Permission matrix — true = allowed, false = hidden/blocked
export const PERMISSIONS = {
  platform_admin: {
    view_dashboard:        true,
    manage_providers:      true,
    manage_companies:      true,
    manage_users:          true,
    suspend_accounts:      true,
    manage_admins:         true,
    view_email_queue:      true,
    view_sms_queue:        true,
    view_reports:          true,
    system_settings:       true,
    view_feedback:         true,
    manage_subscriptions:  true,   // full CRUD on pricing, tiers, discounts, packages, subscriber lifecycle
  },
  admin: {
    view_dashboard:        true,
    manage_providers:      true,
    manage_companies:      true,
    manage_users:          true,
    suspend_accounts:      true,
    manage_admins:         false,
    view_email_queue:      true,
    view_sms_queue:        true,
    view_reports:          true,
    system_settings:       false,
    view_feedback:         true,
    manage_subscriptions:  true,   // can manage subscriptions (approve, suspend, pricing)
  },
  moderator: {
    view_dashboard:        true,
    manage_providers:      true,
    manage_companies:      true,
    manage_users:          true,
    suspend_accounts:      false,
    manage_admins:         false,
    view_email_queue:      false,
    view_sms_queue:        false,
    view_reports:          false,
    system_settings:       false,
    view_feedback:         true,
    manage_subscriptions:  false,
  },
  support: {
    view_dashboard:        true,
    manage_providers:      false,
    manage_companies:      false,
    manage_users:          true,
    suspend_accounts:      false,
    manage_admins:         false,
    view_email_queue:      true,
    view_sms_queue:        true,
    view_reports:          false,
    system_settings:       false,
    view_feedback:         true,
    manage_subscriptions:  false,
  },
  reviewer: {
    view_dashboard:        true,
    manage_providers:      true,
    manage_companies:      true,
    manage_users:          false,
    suspend_accounts:      false,
    manage_admins:         false,
    view_email_queue:      false,
    view_sms_queue:        false,
    view_reports:          false,
    system_settings:       false,
    view_feedback:         false,
    manage_subscriptions:  false,
  },
}

// All admin role codes (for middleware and queries)
export const ADMIN_ROLE_CODES = ['platform_admin', 'admin', 'moderator', 'support', 'reviewer']

// Roles that can be assigned by platform_admin (excludes platform_admin itself)
export const ASSIGNABLE_ROLES = ['admin', 'moderator', 'support', 'reviewer']

/**
 * Get the highest admin role from a user's role codes.
 * Returns null if the user has no admin roles.
 */
export function getHighestAdminRole(roleCodes = []) {
  for (const code of ['platform_admin', 'admin', 'moderator', 'support', 'reviewer']) {
    if (roleCodes.includes(code)) return code
  }
  return null
}

/**
 * Check if a role code has a specific permission.
 */
export function hasPermission(roleCode, permission) {
  return PERMISSIONS[roleCode]?.[permission] === true
}