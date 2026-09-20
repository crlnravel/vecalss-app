// Architecture-test fixture only. It intentionally lives under a production
// source root so the scanner proves an unregistered worker mutation fails.
export async function unregisteredTryoutWorkerWriter(tx: {
  tryoutPackage: { update(input: unknown): Promise<unknown> };
}) {
  return tx.tryoutPackage.update({ data: { title: "fixture" } });
}
