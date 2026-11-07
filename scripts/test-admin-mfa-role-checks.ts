import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every place in runtime code that compares a role to admin is
 * listed here with how it stays behind the second factor. The session context
 * (lib/auth/session.ts) leaves admin out of `roles` until the
 * session is verified, so a check that reads the context inherits the rule. A
 * check that reads the database instead must go through lib/auth/mfa.
 *
 * Adding a new direct admin check makes this test fail on purpose:
 * decide which of the two it is, make it so, then add it below.
 */
const ROLE_CHECKS: Record<string, { count: number; how: string }> = {
  "lib/auth/access.ts": {
    count: 2,
    how: "central guards: redirectIfMfaPending runs first, then hasRole on the context",
  },
  "lib/auth/debug-account-switcher.ts": {
    count: 1,
    how: "dev-only account list ordering; a switched session starts unverified like any other",
  },
  "lib/auth/mfa/constants.ts": { count: 1, how: "the policy: which roles need the factor" },
  "lib/auth/mfa/data-layer.ts": {
    count: 1,
    how: "database-side admin check that requires a live verified session",
  },
  "lib/auth/paths.ts": {
    count: 1,
    how: "home-path routing from effective roles; a pending account is routed to /mfa first",
  },
  "lib/auth/service.ts": {
    count: 1,
    how: "sign-in role support (authorizes nothing); the login result carries no privileged roles",
  },
  "lib/banner/delivery.ts": { count: 1, how: "reads session.user.roles from the context" },
  "lib/disputes/export.ts": {
    count: 1,
    how: "owner recheck in the database; only reached with an owner context from requireOwner, which needs a verified second factor",
  },
  "lib/fraud/authority.ts": {
    count: 1,
    how: "requireAdmin checks mfaStatus is verified before the roles check; owner actions add the FRAUD_OWNER_EMAIL check",
  },
  "lib/fraud/blocks.ts": {
    count: 1,
    how: "refuses to block admin accounts (authorizes nothing)",
  },
  "lib/media/repository.ts": { count: 1, how: "hasRole on the context" },
  "lib/reports/access.ts": { count: 1, how: "roles passed from the context" },
  "lib/retention/release-hold.mjs": {
    count: 1,
    how: "command-line only, run with the schema owner's database login (it refuses the app's runtime login); the check only identifies the owner account to record, and no web route reaches it",
  },
  "lib/tryout/capabilities.ts": { count: 1, how: "reads session.user.roles from the context" },
  "lib/tryout/result-recovery-http.ts": { count: 1, how: "reads session.user.roles from the context" },
};

/** Files allowed to build the `roles` of a signed-in user from role assignments. */
const ROLE_BUILDERS = new Set([
  "lib/auth/debug-account-switcher.ts",
  "lib/auth/service.ts",
  "lib/auth/session.ts",
]);

const ROOTS = ["app", "components", "hooks", "lib", "modules", "workers", "proxy.ts"];
const CHECK = /RoleName\.admin\b|(?=.*\brole)[^\n]*["']admin["']/u;
/** The developer role was removed (MS-23): no runtime file may name it again. */
const RETIRED_ROLE = /RoleName\.developer\b|(?=.*\brole)[^\n]*["']developer["']|requireDeveloperSession/u;

function sourceFiles() {
  const files: string[] = [];
  const walk = (path: string) => {
    let info;
    try {
      info = statSync(path);
    } catch {
      return;
    }
    if (info.isDirectory()) {
      for (const name of readdirSync(path)) {
        if (name === "node_modules" || name === ".next" || name === "generated") continue;
        walk(join(path, name));
      }
    } else if (/\.(?:ts|tsx|mjs)$/u.test(path)) {
      files.push(relative(process.cwd(), path));
    }
  };
  ROOTS.forEach(walk);
  return files;
}

const files = sourceFiles();
assert.ok(files.length > 200, "the scan should see the whole codebase");

const found: Record<string, number> = {};
for (const file of files) {
  const count = readFileSync(file, "utf8").split("\n").filter((line) => CHECK.test(line)).length;
  if (count) found[file] = count;
}

const expected = Object.fromEntries(Object.entries(ROLE_CHECKS).map(([file, { count }]) => [file, count]));
assert.deepEqual(
  found,
  expected,
  "Direct admin role checks changed. Make the new check read the session context (roles) or go through lib/auth/mfa, then update ROLE_CHECKS in scripts/test-admin-mfa-role-checks.ts.",
);

// The developer role no longer exists: not in the schema, not in runtime code, not as a route.
const retiredRoleUses = files.filter((file) => readFileSync(file, "utf8").split("\n").some((line) => RETIRED_ROLE.test(line)));
assert.deepEqual(retiredRoleUses, [], "The developer role was removed. Use admin, and do not add the role back.");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const roleEnum = /enum RoleName \{([^}]*)\}/u.exec(schema)?.[1] ?? "";
assert.deepEqual(roleEnum.split(/\s+/u).filter((word) => /^[a-z]+$/u.test(word)), ["student", "tutor", "admin", "affiliator"], "RoleName lists exactly the four roles in use");
for (const gone of ["app/developer", "app/api/developer", "modules/developer"]) {
  assert.throws(() => statSync(gone), `${gone} was deleted with the developer role`);
}

const builders = files.filter((file) => {
  const text = readFileSync(file, "utf8");
  return /roleAssignments|role_assignments/u.test(text) && /^\s*roles(?::|,)|\broles:\s/mu.test(text);
});
assert.deepEqual(
  new Set(builders),
  ROLE_BUILDERS,
  "A new file builds signed-in `roles` from role assignments. Route it through resolveMfaRoles (lib/auth/mfa/state.ts) and add it to ROLE_BUILDERS.",
);

// Data-layer lookups that accept an admin by account id use the verified-session rule.
for (const file of ["lib/auth/kapten-access.ts", "lib/tryout/invitation-picker.ts", "lib/resource-edit-lock/service.ts"]) {
  assert.match(readFileSync(file, "utf8"), /kaptenOrAdminRoleSql\(|isActiveKaptenOrAdmin\(/u, `${file} must use lib/auth/mfa/data-layer`);
}

// The two session readers must both apply the second-factor rule.
const session = readFileSync("lib/auth/session.ts", "utf8");
assert.equal(session.match(/resolveMfaRoles\(/gu)?.length, 2, "getSessionContext and the read-only reader both resolve MFA roles");

console.log(`Admin role checks: ${Object.keys(found).length} files, all accounted for.`);
