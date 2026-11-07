/**
 * Demo transactions for a developer's machine (MS-22). Runs the real checkout,
 * the stand-in provider, the payment inbox and the refund and dispute code, so
 * the audit trail it leaves is genuine. Refuses to run anywhere but a local
 * database with PAYMENT_STAND_IN_LOCAL=1; see scripts/transaction-demo-seed.ts.
 *
 *   pnpm db:seed-transaction-demo
 *
 * Safe to run twice. Needs the local accounts and the published package that
 * `just local-reset` seeds.
 */
import { existsSync } from "node:fs";

// The app reads `.env.local`; Node does not unless asked. Variables already set in the shell win.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const { DemoSeedRefusedError } = await import("../lib/payments/stand-in/demo-seed-guard");
  const { DEMO_SCENARIOS, runDemoSeed } = await import("./transaction-demo-seed");
  try {
    const results = await runDemoSeed({ log: (line) => console.log(line) });
    console.log(`\nDemo transactions ready (${results.filter((item) => item.seeded).length} new, ${results.filter((item) => !item.seeded).length} already there):`);
    for (const result of results) console.log(`  ${result.slug.padEnd(20)} ${result.buyerEmail}  /admin/fraud/orders/${result.orderId}`);
    console.log(`\n${DEMO_SCENARIOS.length} scenarios. See docs/agent-app-testing-guide.md for the steps.`);
  } catch (error) {
    if (error instanceof DemoSeedRefusedError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "The demo seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    // Only a run that got past the gate has a client to close; a refused run never made one.
    await (globalThis as { vecalssPrisma?: { $disconnect(): Promise<void> } }).vecalssPrisma?.$disconnect();
  });
