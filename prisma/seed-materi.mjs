// Deliberate Materi cutover entry point. It performs a read-only preflight by
// default; deletion and reseeding require both --apply and the exact
// confirmation token documented by `node prisma/seed-materi.mjs --help`.
import { runMateriResetSeed } from "./materi-reset.mjs";

runMateriResetSeed().catch((error) => {
  console.error("Failed to run the guarded Materi reset/seed.");
  console.error(error);
  process.exitCode = 1;
});
