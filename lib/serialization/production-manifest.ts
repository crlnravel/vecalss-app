import "server-only";

/**
 * Checked-in production boundary for writer exhaustiveness. Package scripts
 * are checked against this same list by the architecture test; adding a new
 * CLI/worker root without updating the manifest is a deliberate failure.
 */
const PRODUCTION_SOURCE_ROOTS = [
  "app/**",
  "modules/**",
  "lib/**",
  "workers/**",
] as const;

const PRODUCTION_NON_SOURCE_PATTERNS = [
  "tests/**",
  "test/**",
  "e2e/**",
  "scripts/test-*",
  "migrations/**",
  "prisma/migrations/**",
  "generated/**",
  ".next/**",
  "build/**",
  "dist/**",
  "cache/**",
  "vendor/**",
  "node_modules/**",
] as const;

type ProductionSourceRoot = (typeof PRODUCTION_SOURCE_ROOTS)[number];

function normalizePath(value: string) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function matchesPattern(path: string, pattern: string) {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.endsWith("/**")) {
    return normalizedPath === normalizedPattern.slice(0, -3)
      || normalizedPath.startsWith(normalizedPattern.slice(0, -2));
  }
  if (normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.slice(0, -1);
    return normalizedPath.startsWith(prefix) && !normalizedPath.slice(prefix.length).includes("/");
  }
  if (normalizedPattern.endsWith("-*")) {
    return normalizedPath.startsWith(normalizedPattern.slice(0, -1));
  }
  return normalizedPath === normalizedPattern;
}

function isExplicitlyExcludedProductionPath(path: string) {
  return PRODUCTION_NON_SOURCE_PATTERNS.some((pattern) => matchesPattern(path, pattern));
}

function productionRootForPath(path: string): ProductionSourceRoot | null {
  const normalized = normalizePath(path);
  if (isExplicitlyExcludedProductionPath(normalized)) return null;
  const root = PRODUCTION_SOURCE_ROOTS.find((candidate) => matchesPattern(normalized, candidate));
  return root ?? null;
}

function assertProductionRootCovered(path: string) {
  if (isExplicitlyExcludedProductionPath(path)) return;
  if (!productionRootForPath(path)) {
    throw new Error(`Production source path is outside PRODUCTION_SOURCE_ROOTS: ${normalizePath(path)}`);
  }
}

function extractExecutableSourcePaths(script: string) {
  const paths = new Set<string>();
  // Production scripts use direct source paths (workers/foo.ts, cli/foo.mjs,
  // etc.). Ignore flags, package binaries, and paths embedded in URLs.
  for (const token of script.match(/[A-Za-z0-9_./-]+\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)\b/g) ?? []) {
    if (token.includes("node_modules/") || token.startsWith("http")) continue;
    paths.add(normalizePath(token));
  }
  return [...paths].sort();
}

function productionScriptSourcePaths(
  scripts: Record<string, string>,
  options: { exclude?: readonly string[] } = {},
) {
  const excluded = new Set(options.exclude ?? ["lint", "build", "verify", "prepare", "tokens", "dev", "start", "doctor"]);
  const paths = new Set<string>();
  for (const [name, command] of Object.entries(scripts)) {
    if (excluded.has(name) || name.startsWith("test:") || name.startsWith("db:") || name.startsWith("admin:imports-worker:")) continue;
    for (const sourcePath of extractExecutableSourcePaths(command)) {
      if (sourcePath.startsWith("scripts/test-") || sourcePath.startsWith("scripts/verify-") || sourcePath.startsWith("prisma/") || sourcePath.startsWith(".next/")) continue;
      paths.add(sourcePath);
    }
  }
  return [...paths].sort();
}

export {
  PRODUCTION_NON_SOURCE_PATTERNS,
  PRODUCTION_SOURCE_ROOTS,
  assertProductionRootCovered,
  extractExecutableSourcePaths,
  isExplicitlyExcludedProductionPath,
  productionRootForPath,
  productionScriptSourcePaths,
};

export type { ProductionSourceRoot };
