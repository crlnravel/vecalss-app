import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(join(tmpdir(), "krf04-result-"));
try {
  const env = { ...process.env, KRF04_RESULT_FIXTURES: join(directory, "results.json") };
  for (const command of ["test:quiz-result-db", "test:quiz-result-presentation"]) {
    const result = spawnSync("pnpm", [command], { env, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}`);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
