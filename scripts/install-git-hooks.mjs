import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

if (process.env.CI || process.env.VERCEL) {
  process.exit(0);
}

if (!existsSync(".git") || !existsSync(".githooks/pre-commit")) {
  process.exit(0);
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "ignore",
  });
} catch {
  process.exit(0);
}
