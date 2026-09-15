export const STAFF_ROLES = [
  'owner', 'super_admin', 'operations', 'support',
  'moderator', 'finance', 'analyst', 'read_only'
] as const;

export type StaffRole = typeof STAFF_ROLES[number];
export type Permission =
  | 'dashboard' | 'online' | 'users' | 'deals' | 'chats' | 'system'
  | 'staff_read' | 'staff_manage' | 'audit_read';

const MATRIX: Record<StaffRole, ReadonlySet<Permission>> = {
  owner: new Set(['dashboard','online','users','deals','chats','system','staff_read','staff_manage','audit_read']),
  super_admin: new Set(['dashboard','online','users','deals','chats','system','staff_read','audit_read']),
  operations: new Set(['dashboard','online','users','deals','chats','system']),
  support: new Set(['dashboard','online','users','deals','chats']),
  moderator: new Set(['dashboard','users']),
  finance: new Set(['dashboard','deals']),
  analyst: new Set(['dashboard','online','users','deals']),
  read_only: new Set(['dashboard','online','users','deals','chats'])
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Owner', super_admin: 'Super Admin', operations: 'Operations',
  support: 'Support', moderator: 'Moderator', finance: 'Finance',
  analyst: 'Analyst', read_only: 'Read Only'
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

export function can(role: StaffRole | string | undefined, permission: Permission): boolean {
  return isStaffRole(role) && MATRIX[role].has(permission);
}

export function permissionForControlResource(resource: string): Permission | null {
  if (resource === '/online') return 'online';
  if (resource === '/users') return 'users';
  if (resource === '/deals') return 'deals';
  if (resource === '/chats') return 'chats';
  if (resource === '/system') return 'system';
  return null;
}
