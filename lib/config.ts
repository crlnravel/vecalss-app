const DEFAULT_APP_BASE_URL = "http://localhost:3000";

function getAppBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.APP_BASE_URL?.trim();

  if (!raw) {
    if (env.NODE_ENV === "production") {
      throw new Error("APP_BASE_URL is required in production.");
    }

    return DEFAULT_APP_BASE_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("APP_BASE_URL must be an absolute URL.");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || (env.NODE_ENV === "production" && parsed.protocol !== "https:")
  ) {
    throw new Error("APP_BASE_URL must be a pathless absolute HTTP(S) origin.");
  }

  return parsed.origin;
}

function getRegistrationFormUrl() {
  return process.env.REGISTRATION_FORM_URL?.trim() || "/#briefing";
}

const isProduction = process.env.NODE_ENV === "production";

function isDebugEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.DEBUG?.trim() === "true";
}

function isDebugAccountSwitcherEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "development" && isDebugEnabled(env);
}

export {
  DEFAULT_APP_BASE_URL,
  getAppBaseUrl,
  getRegistrationFormUrl,
  isDebugAccountSwitcherEnabled,
  isDebugEnabled,
  isProduction,
};
