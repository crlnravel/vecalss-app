import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const projectName = `vecalss-scalability-${process.pid}-${randomBytes(6).toString("hex")}`
  .toLowerCase()
  .replace(/[^a-z0-9_-]/gu, "-");
const composeFile = "docker-compose.scalability.yml";
const configuredSecret = process.env.SCALABILITY_SIMULATION_SECRET?.trim();

if (configuredSecret === "vecalss-local-scalability-only") {
  throw new Error("SCALABILITY_SIMULATION_SECRET must not use the retired default value");
}

if (configuredSecret && configuredSecret.length < 32) {
  throw new Error("SCALABILITY_SIMULATION_SECRET must be at least 32 characters");
}

const composeEnvironment = {
  ...process.env,
  SCALABILITY_SIMULATION_SECRET: configuredSecret || randomBytes(32).toString("hex"),
};
let activeChild = null;
let interrupted = false;

function runDockerCompose(args, { allowFailure = false, ignoreInterrupt = false } = {}) {
  if (interrupted && !ignoreInterrupt) {
    return Promise.reject(new Error("scalability simulation interrupted"));
  }

  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "-p", projectName, "-f", composeFile, ...args], {
      stdio: "inherit",
      env: composeEnvironment,
    });
    activeChild = child;
    const clearActiveChild = () => {
      if (activeChild === child) {
        activeChild = null;
      }
    };

    child.once("error", (error) => {
      clearActiveChild();
      if (allowFailure) {
        resolve(1);
        return;
      }
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearActiveChild();
      if (code === 0 || allowFailure) {
        resolve(code ?? 1);
        return;
      }
      reject(new Error(`docker compose ${args.join(" ")} exited with ${signal ?? code}`));
    });
  });
}

function handleSignal(signal) {
  interrupted = true;
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  activeChild?.kill(signal);
}

const handleSigint = () => handleSignal("SIGINT");
const handleSigterm = () => handleSignal("SIGTERM");
process.once("SIGINT", handleSigint);
process.once("SIGTERM", handleSigterm);

console.log(`Starting disposable Compose project ${projectName}`);

try {
  await runDockerCompose(["up", "--build", "--detach", "redis", "api1", "api2"]);
  await runDockerCompose(["run", "--rm", "loadtest"]);
} finally {
  await runDockerCompose(["down", "--volumes", "--remove-orphans"], {
    allowFailure: true,
    ignoreInterrupt: true,
  });
  process.removeListener("SIGINT", handleSigint);
  process.removeListener("SIGTERM", handleSigterm);
}
