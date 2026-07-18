import { Role } from "@prisma/client";
import { NAV_MODULES, type NavModule } from "./modules";

/** Roles that may see the full Platform modules directory and ops tooling. */
export const PLATFORM_OPERATOR_ROLES: Role[] = [Role.ADMIN, Role.DEVELOPER];

export function isPlatformOperator(role?: string | null): boolean {
  return role === Role.ADMIN || role === Role.DEVELOPER;
}

export function isDeveloper(role?: string | null): boolean {
  return role === Role.DEVELOPER;
}

export function isAdmin(role?: string | null): boolean {
  return role === Role.ADMIN || role === Role.DEVELOPER;
}

/**
 * Module visibility for directory / nav surfaces.
 * - all: any signed-in or public marketing context when the parent surface allows it
 * - admin: ADMIN + DEVELOPER
 * - developer: DEVELOPER only (archive / low-level platform)
 */
export type ModuleAccess = "all" | "admin" | "developer";

export function accessForModule(m: NavModule): ModuleAccess {
  if (m.access) return m.access;
  if (m.group === "Developer") {
    if (m.featureKey === "archive") return "developer";
    return "admin";
  }
  if (m.group === "Admin") return "admin";
  return "all";
}

export function canViewModule(role: string | null | undefined, m: NavModule): boolean {
  const access = accessForModule(m);
  if (access === "all") return true;
  if (access === "admin") return isPlatformOperator(role);
  if (access === "developer") return isDeveloper(role);
  return false;
}

/** Full platform module directory — operators only. */
export function platformModulesForRole(role: string | null | undefined): NavModule[] {
  if (!isPlatformOperator(role)) return [];
  return NAV_MODULES.filter((m) => canViewModule(role, m));
}

export function groupModules(modules: NavModule[]): Array<{ group: string; items: NavModule[] }> {
  const groups = Array.from(new Set(modules.map((m) => m.group)));
  return groups.map((group) => ({
    group,
    items: modules.filter((m) => m.group === group),
  }));
}
