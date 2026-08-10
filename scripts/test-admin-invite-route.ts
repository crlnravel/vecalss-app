import assert from "node:assert/strict";

import { isSameOrigin, POST } from "@/app/api/invite/[token]/route";
import {
  buildEnrollmentInviteUrl,
  EnrollmentHandoffCryptoError,
  getTrustedAppBaseUrl,
} from "@/lib/admin/handoffs/envelope";

const response = await POST(
  new Request("http://localhost/api/invite/token", {
    body: JSON.stringify({ confirmPassword: "Password123", password: "Password123" }),
    headers: {
      "content-type": "application/json",
      origin: "https://untrusted.example",
    },
    method: "POST",
  }),
  { params: Promise.resolve({ token: "not-a-real-token" }) },
);

assert.equal(response.status, 400);
assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
assert.equal(response.headers.get("referrer-policy"), "no-referrer");
assert.deepEqual(await response.json(), { error: "invalid_invite" });

const pathfulEnv: NodeJS.ProcessEnv = {
  ...process.env,
  APP_BASE_URL: "https://trusted.example/console",
  NODE_ENV: "test",
};
const isInvalidBaseUrl = (error: unknown) =>
  error instanceof EnrollmentHandoffCryptoError && error.code === "invalid_base_url";

assert.throws(() => getTrustedAppBaseUrl(pathfulEnv), isInvalidBaseUrl);
assert.throws(() => buildEnrollmentInviteUrl("opaque-token", pathfulEnv), isInvalidBaseUrl);

const canonicalEnv: NodeJS.ProcessEnv = {
  ...process.env,
  APP_BASE_URL: "https://trusted.example/",
  NODE_ENV: "test",
};
assert.equal(getTrustedAppBaseUrl(canonicalEnv), "https://trusted.example");
assert.equal(
  buildEnrollmentInviteUrl("opaque-token", canonicalEnv),
  "https://trusted.example/invite/opaque-token",
);

const previousAppBaseUrl = process.env.APP_BASE_URL;
try {
  process.env.APP_BASE_URL = pathfulEnv.APP_BASE_URL;
  assert.equal(
    isSameOrigin(new Request("https://trusted.example/invite/opaque-token", {
      headers: { origin: "https://trusted.example" },
    })),
    false,
  );

  process.env.APP_BASE_URL = canonicalEnv.APP_BASE_URL;
  assert.equal(
    isSameOrigin(new Request("https://trusted.example/invite/opaque-token", {
      headers: { origin: "https://trusted.example" },
    })),
    true,
  );
} finally {
  if (previousAppBaseUrl === undefined) {
    delete process.env.APP_BASE_URL;
  } else {
    process.env.APP_BASE_URL = previousAppBaseUrl;
  }
}

console.log("admin invite route boundary checks passed");
