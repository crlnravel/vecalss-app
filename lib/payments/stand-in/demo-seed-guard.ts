import { HOSTING_PLATFORM_MARKERS, isLocalStandInRuntime, isStrictLoopbackDatabaseUrl } from "./gate";

type GateEnv = Partial<Record<string, string | undefined>>;

/**
 * Why the demo transaction seed may not run here. It names the settings that
 * fail, never their values: a connection string must not reach a terminal or a log.
 * The seed writes real payment evidence into whatever database it is pointed at,
 * and that evidence can never be deleted again, so it runs only where the
 * stand-in provider itself is allowed: a developer's own machine.
 */
function demoSeedRefusals(env: GateEnv = process.env): string[] {
  if (isLocalStandInRuntime(env)) return [];

  const problems: string[] = [];
  if (env.PAYMENT_STAND_IN_LOCAL?.trim() !== "1") problems.push("PAYMENT_STAND_IN_LOCAL is not set to 1");
  if (env.NODE_ENV === "production") problems.push("NODE_ENV is production");
  if (!isStrictLoopbackDatabaseUrl(env.DATABASE_URL)) problems.push("DATABASE_URL does not point at this machine (localhost, 127.0.0.1 or ::1)");
  try {
    const host = new URL(env.APP_BASE_URL?.trim() ?? "").hostname.toLowerCase();
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) problems.push("APP_BASE_URL is not a loopback address");
  } catch {
    problems.push("APP_BASE_URL is not set to a loopback address");
  }
  for (const name of HOSTING_PLATFORM_MARKERS) {
    if (env[name]?.trim()) problems.push(`${name} is set, which marks a hosting platform`);
  }
  // Some other part of the gate failed in a way the list above does not name; stay closed.
  if (problems.length === 0) problems.push("the local stand-in check did not pass");
  return problems;
}

class DemoSeedRefusedError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`The demo transaction seed only runs on a developer's own machine, so it did not start: ${problems.join("; ")}.`);
    this.name = "DemoSeedRefusedError";
    this.problems = problems;
  }
}

function assertDemoSeedAllowed(env: GateEnv = process.env) {
  const problems = demoSeedRefusals(env);
  if (problems.length > 0) throw new DemoSeedRefusedError(problems);
}

export { DemoSeedRefusedError, assertDemoSeedAllowed, demoSeedRefusals };
