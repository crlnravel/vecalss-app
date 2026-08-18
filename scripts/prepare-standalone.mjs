import { cpSync, existsSync, mkdirSync } from "node:fs";

const standaloneDirectory = ".next/standalone";

if (!existsSync(standaloneDirectory)) {
  throw new Error("Next standalone output is missing; run next build first");
}

cpSync("public", `${standaloneDirectory}/public`, { recursive: true });
mkdirSync(`${standaloneDirectory}/.next`, { recursive: true });
cpSync(".next/static", `${standaloneDirectory}/.next/static`, { recursive: true });
