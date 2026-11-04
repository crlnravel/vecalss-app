import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every student entry point is either gated by paid access or listed here as one
 * a student needs whatever their package. Every student page and action goes
 * through requireStudentSession, which is gated unless the call says
 * `allowUnpaid: true`; every student API route checks the role itself, so it
 * must also call paidAccessDenial. A new student surface that does neither
 * fails this test until someone decides which kind it is.
 *
 * The behaviour of each surface is checked in test-paid-access-http.ts; this
 * keeps the list honest.
 */

/** requireStudentSession() call sites outside lib/auth: [gated, exempt]. */
const GUARD_SITES: Record<string, [gated: number, exempt: number]> = {
  "app/akses-paket/page.tsx": [0, 1], // explains the missing package
  "app/courses/[slug]/[lessonId]/page.tsx": [1, 0],
  "app/courses/[slug]/page.tsx": [1, 0],
  "app/courses/page.tsx": [1, 0],
  "app/dashboard/page.tsx": [1, 0],
  "app/notifications/[notificationId]/page.tsx": [0, 1], // payment receipts arrive here
  "app/notifications/page.tsx": [0, 1],
  "app/onboarding/page.tsx": [0, 1],
  "app/quiz/[slug]/[quizSlug]/page.tsx": [1, 0],
  "app/quiz/[slug]/[quizSlug]/result/page.tsx": [1, 0],
  "app/quiz/[slug]/page.tsx": [1, 0],
  "app/quiz/page.tsx": [1, 0],
  "app/settings/page.tsx": [0, 1],
  "app/tryout/[tryoutId]/page.tsx": [1, 0],
  "app/tryout/[tryoutId]/register/page.tsx": [1, 0],
  "app/tryout/[tryoutId]/waiting/page.tsx": [1, 0],
  "app/tryout/attempt/[attemptId]/page.tsx": [1, 0],
  "app/tryout/attempt/[attemptId]/result/page.tsx": [1, 0],
  "app/tryout/page.tsx": [1, 0],
  "app/vera-ai/page.tsx": [1, 0],
  "app/videos/page.tsx": [1, 0],
  "modules/quiz/actions.ts": [4, 0],
  "modules/student/actions.ts": [0, 4], // onboarding, profile, notifications
  "modules/tryout/participant-actions.ts": [3, 0], // the rest go through participantSession()
};

/** Files that check for the student role themselves: [role checks, paidAccessDenial calls]. */
const ROLE_CHECK_SITES: Record<string, [checks: number, paid: number]> = {
  "app/api/courses/[slug]/[lessonId]/document/route.ts": [1, 1],
  "app/api/courses/[slug]/[lessonId]/progress/route.ts": [1, 1],
  "app/api/notifications/read/route.ts": [1, 0], // in-app receipts: open to every student
  "app/api/notifications/route.ts": [1, 0],
  "app/api/vera/chat/route.ts": [1, 1],
  "app/api/vera/conversations/[id]/route.ts": [2, 2],
  "app/api/vera/conversations/route.ts": [2, 2],
  "app/api/vera/mentions/route.ts": [1, 1],
  "app/api/vera/studio/[id]/route.ts": [2, 2],
  "app/api/vera/studio/route.ts": [2, 2],
  "app/api/vera/usage/route.ts": [1, 1],
  "lib/banner/delivery.ts": [1, 0], // banner artwork is shown on pages that are themselves gated
  "lib/tryout/participant-recovery-http.ts": [1, 1],
};

const ROOTS = ["app", "lib", "modules"];
const ROLE_CHECK = /RoleName\.student|roles\.includes\("student"\)/gu;

function sourceFiles() {
  const files: string[] = [];
  const walk = (path: string) => {
    for (const name of readdirSync(path)) {
      if (name === "node_modules" || name === ".next") continue;
      const full = join(path, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(?:ts|tsx)$/u.test(full)) files.push(relative(process.cwd(), full));
    }
  };
  ROOTS.forEach(walk);
  return files;
}

/** The text of a call's argument list, from just after its "(" to the matching ")". */
function callArguments(source: string, from: number) {
  let depth = 1;
  let index = from;
  while (index < source.length && depth > 0) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") depth -= 1;
    index += 1;
  }
  return source.slice(from, index - 1);
}

const files = sourceFiles();
assert.ok(files.length > 500, "the scan should see the whole codebase");

const guardSites: Record<string, [number, number]> = {};
const roleSites: Record<string, [number, number]> = {};

for (const file of files) {
  if (file.startsWith("lib/auth/") || file.startsWith("scripts/")) continue;
  const source = readFileSync(file, "utf8");

  for (const match of source.matchAll(/requireStudentSession\(/gu)) {
    const exempt = /allowUnpaid:\s*true/u.test(callArguments(source, (match.index ?? 0) + match[0].length));
    guardSites[file] ??= [0, 0];
    guardSites[file][exempt ? 1 : 0] += 1;
  }

  const checks = [...source.matchAll(ROLE_CHECK)].length;
  const isApi = file.startsWith("app/api/") || file === "lib/banner/delivery.ts" || file === "lib/tryout/participant-recovery-http.ts";
  if (checks && isApi) roleSites[file] = [checks, [...source.matchAll(/paidAccessDenial\(/gu)].length];
}

assert.deepEqual(
  guardSites,
  GUARD_SITES,
  "A student page or action changed. Gate it (the default) or add allowUnpaid with a reason, then update GUARD_SITES in scripts/test-paid-access-surfaces.ts.",
);
assert.deepEqual(
  roleSites,
  ROLE_CHECK_SITES,
  "A student API route changed. Call paidAccessDenial after its student check, or list it as open with a reason, in ROLE_CHECK_SITES.",
);

// The guard itself is gated by default and only skips the check when asked.
const access = readFileSync("lib/auth/access.ts", "utf8");
assert.match(access, /allowUnpaid\s*=\s*false/u, "requireStudentSession is a paid surface unless the caller opts out");
assert.match(access, /!allowUnpaid\s*&&\s*!\(await (?:studentMayUsePaidSurfaces|enterPaidSurface)/u);

const gated = Object.values(GUARD_SITES).reduce((sum, [paid]) => sum + paid, 0);
const open = Object.values(GUARD_SITES).reduce((sum, [, free]) => sum + free, 0);
console.log(`Paid access surfaces: ${gated} gated page/action guards, ${open} open (onboarding, settings, notifications, the explanation); ${Object.values(ROLE_CHECK_SITES).reduce((sum, [, paid]) => sum + paid, 0)} gated API handlers.`);
