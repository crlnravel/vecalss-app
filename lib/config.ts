const DEFAULT_APP_BASE_URL = "http://localhost:3000";

function getAppBaseUrl() {
  return process.env.APP_BASE_URL?.trim() || DEFAULT_APP_BASE_URL;
}

function getRegistrationFormUrl() {
  return process.env.REGISTRATION_FORM_URL?.trim() || "/#briefing";
}

const isProduction = process.env.NODE_ENV === "production";

export {
  DEFAULT_APP_BASE_URL,
  getAppBaseUrl,
  getRegistrationFormUrl,
  isProduction,
};
