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
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    (env.NODE_ENV === "production" && parsed.protocol !== "https:")
  ) {
    throw new Error("APP_BASE_URL must be a pathless absolute HTTP(S) origin.");
  }

  return parsed.origin;
}

function getRegistrationFormUrl() {
  return (
    process.env.REGISTRATION_FORM_URL?.trim() ||
    "https://linktr.ee/vecalss.academy"
  );
}

/**
 * Where someone refused by a fraud block, or anyone with a payment problem,
 * can reach the team. Defaults to the Instagram account the site already links
 * everywhere; set SUPPORT_CONTACT_URL and SUPPORT_CONTACT_LABEL to change it.
 */
function getSupportContact(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPPORT_CONTACT_URL?.trim();
  const label = env.SUPPORT_CONTACT_LABEL?.trim();

  if (url && /^https:\/\//u.test(url)) {
    return { label: label || "Hubungi tim Vecalss", url };
  }

  return { label: "Instagram @vecalss.academy", url: "https://www.instagram.com/vecalss.academy/" };
}

const isProduction = process.env.NODE_ENV === "production";

function isDebugEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.DEBUG?.trim() === "true";
}

function isDebugAccountSwitcherEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "development" && isDebugEnabled(env);
}

/**
 * The preview workspace is part of the normal admin workflow once the
 * managed fixture has been seeded. Set ADMIN_STUDENT_PREVIEW_ENABLED=false
 * for an explicit rollout pause. Every preview page, read entry point, and
 * mutation checks this capability again at request time so an old tab cannot
 * keep using the feature after it is disabled.
 */
function isAdminStudentPreviewEnabled(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.ADMIN_STUDENT_PREVIEW_ENABLED?.trim().toLowerCase();

  return configured === undefined || configured === ""
    ? true
    : configured === "true";
}

export {
  DEFAULT_APP_BASE_URL,
  getAppBaseUrl,
  getRegistrationFormUrl,
  getSupportContact,
  isAdminStudentPreviewEnabled,
  isDebugAccountSwitcherEnabled,
  isDebugEnabled,
  isProduction,
};
