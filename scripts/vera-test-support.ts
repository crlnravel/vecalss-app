export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export async function expectReject(action: () => unknown | Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

export async function runChecks(name: string, checks: Array<{ name: string; run: () => unknown | Promise<unknown> }>): Promise<void> {
  const failures: string[] = [];
  for (const check of checks) {
    try {
      await check.run();
      console.log(`PASS ${name}: ${check.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${check.name}: ${message}`);
      console.error(`FAIL ${name}: ${check.name} — ${message}`);
    }
  }
  if (failures.length) {
    throw new Error(`${name} failed ${failures.length}/${checks.length} checks.`);
  }
  console.log(`PASS ${name}: ${checks.length} checks`);
}
