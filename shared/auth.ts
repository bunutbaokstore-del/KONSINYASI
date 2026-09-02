export const APP_ROLES = [
  "distributor",
  "admin",
  "mitra_umkm",
  "supervisor",
  "sales_motoris",
  "hrd",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export const PLATFORM_ROLES = ["sys_admin"] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export type TenantRole = AppRole;

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  sys_admin: "Sysadmin",
};

export const MANAGED_ROLES = [
  "admin",
  "mitra_umkm",
  "supervisor",
  "sales_motoris",
  "hrd",
] as const satisfies readonly AppRole[];

export type ManagedRole = (typeof MANAGED_ROLES)[number];

export const ACCOUNT_STATUSES = ["active", "disabled"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  distributor: "Distributor",
  admin: "Admin",
  mitra_umkm: "Mitra UMKM",
  supervisor: "Supervisor",
  sales_motoris: "Sales Motoris",
  hrd: "HRD",
};

export function isAppRole(value: unknown): value is AppRole {
  return (
    typeof value === "string" &&
    (APP_ROLES as readonly string[]).includes(value)
  );
}

export function isPlatformRole(value: unknown): value is PlatformRole {
  return (
    typeof value === "string" &&
    (PLATFORM_ROLES as readonly string[]).includes(value)
  );
}

export function platformRoleFromMetadata(value: unknown): PlatformRole | null {
  return isPlatformRole(value) ? value : null;
}

export function isManagedRole(value: unknown): value is ManagedRole {
  return (
    typeof value === "string" &&
    (MANAGED_ROLES as readonly string[]).includes(value)
  );
}

export function roleFromMetadata(value: unknown): AppRole {
  return isAppRole(value) ? value : "distributor";
}
