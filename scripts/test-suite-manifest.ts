import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = {
  scripts?: Record<string, string>;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDirectory = resolve(root, "scripts");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as PackageJson;
const packageScripts = Object.entries(packageJson.scripts ?? {})
  .filter(([name]) => name.startsWith("test:") || name.startsWith("db:test-"));
const testFiles = (await readdir(scriptsDirectory))
  .filter((name) => /^test-[\w.-]+\.(?:mjs|ts)$/u.test(name))
  .sort();
const testFileSet = new Set(testFiles);
const referencedFiles = new Map<string, string[]>();

for (const [name, command] of packageScripts) {
  for (const match of command.matchAll(/scripts\/(test-[\w.-]+\.(?:mjs|ts))/gu)) {
    const file = match[1];
    const commands = referencedFiles.get(file) ?? [];
    commands.push(name);
    referencedFiles.set(file, commands);

    assert(testFileSet.has(file), `${name} references missing test file scripts/${file}`);
  }
}

const unregisteredFiles = testFiles.filter((file) => !referencedFiles.has(file));
assert.deepEqual(unregisteredFiles, [], "Every scripts/test-* file must be exposed by a package test command");

console.log(`Test-suite manifest passed: ${testFiles.length} test files exposed by ${packageScripts.length} package commands.`);
