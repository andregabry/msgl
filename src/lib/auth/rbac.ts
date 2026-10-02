export type AppRole =
  | "ADMIN"
  | "BACKUP_OPERATOR"
  | "MIGRATION_OPERATOR"
  | "AUDITOR"
  | "USER";

export type Permission =
  | "manage:all"
  | "manage:users"
  | "manage:integrations"
  | "backup:request"
  | "backup:process"
  | "backup:delete"
  | "backup:download"
  | "migration:prepare"
  | "migration:execute"
  | "audit:view"
  | "chat:view_all"
  | "chat:view_own";

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  ADMIN: [
    "manage:all",
    "manage:users",
    "manage:integrations",
    "backup:request",
    "backup:process",
    "backup:delete",
    "backup:download",
    "migration:prepare",
    "migration:execute",
    "audit:view",
    "chat:view_all",
    "chat:view_own",
  ],
  BACKUP_OPERATOR: [
    "backup:request",
    "backup:process",
    "backup:download",
    "audit:view",
    "chat:view_own",
  ],
  MIGRATION_OPERATOR: [
    "migration:prepare",
    "migration:execute",
    "backup:download",
    "audit:view",
    "chat:view_own",
  ],
  AUDITOR: [
    "audit:view",
    "chat:view_all", // Read-only audit access
  ],
  USER: [
    "chat:view_own",
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role as AppRole] || [];
  if (permissions.includes("manage:all")) return true;
  return permissions.includes(permission);
}

export function assertPermission(role: string, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Permissão negada. Função '${role}' não tem acesso a '${permission}'.`);
  }
}
