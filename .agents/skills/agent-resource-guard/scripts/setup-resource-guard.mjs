#!/usr/bin/env node

import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const DEFAULTS = {
  loadFactor: "1.25",
  hotProcessCpu: "25",
  maxHotProcesses: "2",
  maxTotalCpu: "160",
  maxLaunchesPerTurn: "3",
  maxLaunchesPerSession: "6",
  lockPrefix: "agent-resource",
};

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_ROOT = path.join(SKILL_ROOT, "templates");

function usage() {
  return `Usage: node scripts/setup-resource-guard.mjs [options]

Options:
  --target DIR                    Target repository (default: current directory)
  --interactive                   Ask for each threshold before writing files
  --load-factor NUMBER            One-minute load threshold multiplier (default: 1.25)
  --hot-process-cpu NUMBER        Hot matching-process CPU percentage (default: 25)
  --max-hot-processes INTEGER     Hot matching-process count (default: 2)
  --max-total-cpu NUMBER          Combined matching CPU percentage (default: 160)
  --max-launches-per-turn INTEGER Instruction-level launch budget (default: 3)
  --max-launches-per-session INTEGER
                                  Instruction-level session budget (default: 6)
  --lock-prefix NAME              Temporary lock prefix (default: agent-resource)
  --guard-path PATH               Relative guard output (default: _harness/resource-guard.sh)
  --policy-path PATH              Relative policy output (default: _harness/resource-policy.md)
  --force                         Replace existing output files
  --help                          Show this help`;
}

function readValue(argv, index, flag) {
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return { value: next, nextIndex: index + 1 };
}

function parseArgs(argv) {
  const options = {
    target: process.cwd(),
    interactive: false,
    force: false,
    guardPath: "_harness/resource-guard.sh",
    policyPath: "_harness/resource-policy.md",
    ...DEFAULTS,
  };

  const aliases = new Map([
    ["--target", "target"],
    ["--load-factor", "loadFactor"],
    ["--hot-process-cpu", "hotProcessCpu"],
    ["--max-hot-processes", "maxHotProcesses"],
    ["--max-total-cpu", "maxTotalCpu"],
    ["--max-launches-per-turn", "maxLaunchesPerTurn"],
    ["--max-launches-per-session", "maxLaunchesPerSession"],
    ["--lock-prefix", "lockPrefix"],
    ["--guard-path", "guardPath"],
    ["--policy-path", "policyPath"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--interactive") {
      options.interactive = true;
      continue;
    }
    if (argument === "--force") {
      options.force = true;
      continue;
    }

    const equalsIndex = argument.indexOf("=");
    const flag = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? null : argument.slice(equalsIndex + 1);
    const optionName = aliases.get(flag);
    if (!optionName) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (inlineValue !== null) {
      if (!inlineValue) throw new Error(`${flag} requires a value.`);
      options[optionName] = inlineValue;
      continue;
    }

    const result = readValue(argv, index, flag);
    options[optionName] = result.value;
    index = result.nextIndex;
  }

  return options;
}

async function askForValues(options) {
  const prompts = [
    ["loadFactor", "Load factor"],
    ["hotProcessCpu", "Hot-process CPU percentage"],
    ["maxHotProcesses", "Maximum hot processes"],
    ["maxTotalCpu", "Maximum combined matching CPU percentage"],
    ["maxLaunchesPerTurn", "Maximum launches per agent turn"],
    ["maxLaunchesPerSession", "Maximum launches per task/session"],
    ["lockPrefix", "Temporary lock prefix"],
  ];

  if (!process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const answers = input.split(/\r?\n/u).map((line) => line.trim());
    prompts.forEach(([key], index) => {
      if (answers[index]) options[key] = answers[index];
    });
    return;
  }

  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const [key, label] of prompts) {
      const answer = (await input.question(`${label} [${options[key]}]: `)).trim();
      if (answer) options[key] = answer;
    }
  } finally {
    input.close();
  }
}

function numericOption(name, value, { integer = false, max }) {
  const normalized = String(value).trim();
  const pattern = integer ? /^\d+$/ : /^\d+(?:\.\d+)?$/;
  if (!pattern.test(normalized)) {
    throw new Error(`${name} must be a positive ${integer ? "integer" : "number"}.`);
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    throw new Error(`${name} must be greater than 0 and no more than ${max}.`);
  }
  return String(parsed);
}

function relativeOutputPath(name, value) {
  const normalized = path.normalize(String(value));
  if (
    path.isAbsolute(normalized)
    || normalized === "."
    || normalized === ".."
    || normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`${name} must be a relative path inside the target repository.`);
  }
  return normalized;
}

function validate(options) {
  options.loadFactor = numericOption("--load-factor", options.loadFactor, { max: 100 });
  options.hotProcessCpu = numericOption("--hot-process-cpu", options.hotProcessCpu, { max: 100 });
  options.maxHotProcesses = numericOption("--max-hot-processes", options.maxHotProcesses, {
    integer: true,
    max: 1000,
  });
  options.maxTotalCpu = numericOption("--max-total-cpu", options.maxTotalCpu, { max: 10000 });
  options.maxLaunchesPerTurn = numericOption("--max-launches-per-turn", options.maxLaunchesPerTurn, {
    integer: true,
    max: 1000,
  });
  options.maxLaunchesPerSession = numericOption(
    "--max-launches-per-session",
    options.maxLaunchesPerSession,
    { integer: true, max: 10000 },
  );
  if (Number(options.maxLaunchesPerTurn) > Number(options.maxLaunchesPerSession)) {
    throw new Error("--max-launches-per-session must be at least --max-launches-per-turn.");
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.lockPrefix)) {
    throw new Error("--lock-prefix must contain only letters, numbers, hyphens, or underscores.");
  }

  options.guardPath = relativeOutputPath("--guard-path", options.guardPath);
  options.policyPath = relativeOutputPath("--policy-path", options.policyPath);
  if (options.guardPath === options.policyPath) {
    throw new Error("--guard-path and --policy-path must point to different files.");
  }
}

function render(template, replacements) {
  return Object.entries(replacements).reduce(
    (contents, [key, value]) => contents.split(`{{${key}}}`).join(String(value)),
    template,
  );
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeOutput(filePath, contents, { force, executable = false }) {
  if (!force && await exists(filePath)) {
    return { path: filePath, status: "skipped", reason: "exists" };
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
  if (executable) await chmod(filePath, 0o755);
  return { path: filePath, status: "written" };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.interactive) await askForValues(options);
  validate(options);

  const target = path.resolve(options.target);
  const guardPath = path.join(target, options.guardPath);
  const policyPath = path.join(target, options.policyPath);
  const replacements = {
    MAX_LOAD_FACTOR: options.loadFactor,
    HOT_PROCESS_CPU: options.hotProcessCpu,
    MAX_HOT_PROCESSES: options.maxHotProcesses,
    MAX_TOTAL_CPU: options.maxTotalCpu,
    MAX_LAUNCHES_PER_TURN: options.maxLaunchesPerTurn,
    MAX_LAUNCHES_PER_SESSION: options.maxLaunchesPerSession,
    LOCK_PREFIX: options.lockPrefix,
    GUARD_PATH: options.guardPath.replaceAll(path.sep, "/"),
  };

  const [guardTemplate, policyTemplate] = await Promise.all([
    readFile(path.join(TEMPLATE_ROOT, "resource-guard.sh"), "utf8"),
    readFile(path.join(TEMPLATE_ROOT, "resource-policy.md"), "utf8"),
  ]);
  const results = [
    await writeOutput(
      guardPath,
      render(guardTemplate, replacements),
      { force: options.force, executable: true },
    ),
    await writeOutput(
      policyPath,
      render(policyTemplate, replacements),
      { force: options.force },
    ),
  ];

  console.log(`Configured agent resource guard for ${target}`);
  console.log(`Thresholds: load ${options.loadFactor}x CPUs, ${options.maxHotProcesses} hot processes at ${options.hotProcessCpu}% CPU, ${options.maxTotalCpu}% total CPU`);
  console.log(`Launch budgets: ${options.maxLaunchesPerTurn}/turn, ${options.maxLaunchesPerSession}/session`);
  for (const result of results) {
    console.log(`${result.status.toUpperCase()} ${path.relative(target, result.path)}${result.reason ? ` (${result.reason})` : ""}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
