import { isActiveKaptenOrAdmin } from "@/lib/auth/kapten-access";

/**
 * Tryouts, reusable packages and assemblies use the same shared-Kapten rule as
 * the rest of Kapten content; see lib/auth/kapten-access.ts.
 */
const isActiveTryoutManager = isActiveKaptenOrAdmin;

export { isActiveTryoutManager };
