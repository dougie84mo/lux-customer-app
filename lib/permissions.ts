import { useCurrentBusiness } from './currentBusiness';

// Role-derived UI gates. These mirror the server-side checks so we hide
// buttons that would be rejected anyway. Tenant isolation and authorization
// are still enforced server-side via RLS + SECURITY DEFINER RPCs
// (`is_business_manager_or_owner`, etc.); these hooks are UX, not security.

export type Role = 'OWNER' | 'MANAGER' | 'EMPLOYEE' | 'ADMIN';

function useRole(): Role | null {
  const { currentMembership } = useCurrentBusiness();
  return (currentMembership?.role as Role | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Granular per-member permissions (migration 0039). These EXTEND a role: an
// explicit grant lets a member do a gated action. Catalog drives the team
// member hub's permission toggles. Server enforces edit_business_profile +
// manage_services via has_member_permission(); the rest are UX gates today.
// ---------------------------------------------------------------------------
export type PermissionKey =
  | 'give_discounts'
  | 'edit_appointments'
  | 'edit_business_profile'
  | 'manage_services'
  | 'assign_devices'
  | 'control_devices'
  | 'capture_photos'
  | 'contact_clients';

export const PERMISSION_CATALOG: { key: PermissionKey; label: string; description: string }[] = [
  { key: 'give_discounts',        label: 'Give discounts',        description: 'Override appointment price / apply discounts.' },
  { key: 'edit_appointments',     label: 'Change appointment times', description: 'Reschedule or move appointments.' },
  { key: 'manage_services',       label: 'Manage services',       description: 'Create, edit, and price services.' },
  { key: 'edit_business_profile', label: 'Edit business profile', description: 'Update business name, logo, description.' },
  { key: 'assign_devices',        label: 'Assign devices',        description: 'Assign mirrors to team members.' },
  { key: 'control_devices',       label: 'Control device modes',  description: 'Switch a mirror between modes.' },
  { key: 'capture_photos',        label: 'Capture client photos', description: 'Take mirror screenshots / photos.' },
  { key: 'contact_clients',       label: 'Contact clients',       description: 'Reach out to / message clients.' },
];

function usePerms(): { role: Role | null; perms: Set<string> } {
  const { currentMembership } = useCurrentBusiness();
  return {
    role: (currentMembership?.role as Role | undefined) ?? null,
    perms: new Set(currentMembership?.permissions ?? []),
  };
}

function isManagerRole(role: Role | null): boolean {
  return role === 'OWNER' || role === 'MANAGER' || role === 'ADMIN';
}

export function useIsOwner(): boolean {
  const role = useRole();
  return role === 'OWNER' || role === 'ADMIN';
}

// Operational grants — manager/owner by default, grantable to employees.
export function useCanGiveDiscounts(): boolean {
  const { role, perms } = usePerms();
  return isManagerRole(role) || perms.has('give_discounts');
}
export function useCanEditAppointments(): boolean {
  const { role, perms } = usePerms();
  return isManagerRole(role) || perms.has('edit_appointments');
}
export function useCanManageServices(): boolean {
  const { role, perms } = usePerms();
  return isManagerRole(role) || perms.has('manage_services');
}
export function useCanAssignDevices(): boolean {
  const { role, perms } = usePerms();
  return isManagerRole(role) || perms.has('assign_devices');
}
export function useCanControlDevices(): boolean {
  const { role, perms } = usePerms();
  return isManagerRole(role) || perms.has('control_devices');
}
export function useCanCapturePhotos(): boolean {
  const { role, perms } = usePerms();
  return isManagerRole(role) || perms.has('capture_photos');
}
export function useCanContactClients(): boolean {
  const { role, perms } = usePerms();
  return isManagerRole(role) || perms.has('contact_clients');
}

// Mirrors `is_business_manager_or_owner` (0002_rls_policies.sql:54-62).
// Used for: invite teammates, pair devices, unpair devices, edit device
// idle/auto-update config.
export function useCanManage(): boolean {
  const role = useRole();
  return role === 'OWNER' || role === 'MANAGER' || role === 'ADMIN';
}

export const useCanInvite = useCanManage;

// Device pairing is OWNER-only — owners pair mirrors and assign them to
// team members. (Managers can still operate already-paired devices.)
export function useCanPair(): boolean {
  const role = useRole();
  return role === 'OWNER' || role === 'ADMIN';
}

// OWNER-only actions: billing changes, business profile edits.
export function useCanManageBilling(): boolean {
  const role = useRole();
  return role === 'OWNER' || role === 'ADMIN';
}

// Owner-default, but grantable to a manager/employee via edit_business_profile
// (server-enforced in 0039). Used by the business-profile editor.
export function useCanEditBusiness(): boolean {
  const { role, perms } = usePerms();
  return role === 'OWNER' || role === 'ADMIN' || perms.has('edit_business_profile');
}
