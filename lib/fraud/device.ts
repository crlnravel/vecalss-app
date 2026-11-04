import "server-only";

import { cookies } from "next/headers";

import { isProduction } from "@/lib/config";

import { isValidDeviceToken, newDeviceToken } from "./tokens";

/**
 * The first-party device cookie. It is random, httpOnly and SameSite=Lax, and
 * Secure in production like the session cookie. Only an HMAC of it is ever
 * stored. Clearing cookies defeats it, so it is one signal among several and
 * never proof of who someone is.
 */
const DEVICE_COOKIE_NAME = "vc_device";
const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function deviceCookieOptions(secure = isProduction) {
  return {
    httpOnly: true,
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure,
  };
}

/** The device value in a Cookie header, or null when it is missing or malformed. */
function readDeviceTokenFromHeader(cookieHeader: string | null) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === DEVICE_COOKIE_NAME) {
      const value = rest.join("=");
      return isValidDeviceToken(value) ? value : null;
    }
  }
  return null;
}

/** A Set-Cookie header value, for responses built by hand. */
function buildDeviceSetCookie(token: string, secure = isProduction) {
  const options = deviceCookieOptions(secure);
  return [
    `${DEVICE_COOKIE_NAME}=${token}`,
    `Max-Age=${options.maxAge}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * Makes sure this browser has a device cookie (server actions and pages), and
 * returns its value. A malformed cookie is replaced.
 */
async function ensureDeviceCookie() {
  const store = await cookies();
  const existing = store.get(DEVICE_COOKIE_NAME)?.value;
  if (isValidDeviceToken(existing)) return existing;

  const token = newDeviceToken();
  store.set(DEVICE_COOKIE_NAME, token, deviceCookieOptions());
  return token;
}

/** The device value the request carries, without setting anything. */
async function readDeviceCookie() {
  const value = (await cookies()).get(DEVICE_COOKIE_NAME)?.value;
  return isValidDeviceToken(value) ? value : null;
}

export {
  buildDeviceSetCookie,
  DEVICE_COOKIE_NAME,
  deviceCookieOptions,
  ensureDeviceCookie,
  readDeviceCookie,
  readDeviceTokenFromHeader,
};
