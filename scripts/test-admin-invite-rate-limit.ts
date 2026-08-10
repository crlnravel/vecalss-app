import assert from "node:assert/strict";

import {
  consumeInviteRateLimit,
  consumePasswordResetRateLimit,
  getTrustedInviteIdentity,
  INVITE_RATE_LIMIT_MAX_ATTEMPTS,
  INVITE_RATE_LIMIT_WINDOW_MS,
  PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS,
} from "@/lib/admin/handoffs/rate-limit";

const now = 1_700_000_000_000;
const knownToken = "a".repeat(64);

assert.equal(getTrustedInviteIdentity(), "anonymous");
assert.equal(
  consumeInviteRateLimit({ identity: "untrusted-client", now, tokenHash: knownToken }),
  false,
);
assert.equal(
  consumeInviteRateLimit({ identity: "anonymous", now, tokenHash: "not-a-hash" }),
  false,
);

for (let attempt = 0; attempt < INVITE_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
  assert.equal(
    consumeInviteRateLimit({ identity: "anonymous", now, tokenHash: knownToken }),
    true,
  );
}

assert.equal(
  consumeInviteRateLimit({ identity: "anonymous", now, tokenHash: knownToken }),
  false,
);

// Regression sequence from the review: send 10,000 unique keys after the
// known token is hot. No active key may be evicted, and the known token must
// remain blocked instead of receiving a fresh window. Independent shards
// keep unrelated keys admissible while one shard is under pressure.
for (let index = 0; index < 10_000; index += 1) {
  const uniqueToken = index.toString(16).padStart(64, "0");
  const accepted = consumeInviteRateLimit({
    identity: "anonymous",
    now,
    tokenHash: uniqueToken,
  });

  assert.equal(accepted, true);
}

assert.equal(
  consumeInviteRateLimit({ identity: "anonymous", now, tokenHash: knownToken }),
  false,
);
assert.equal(
  consumeInviteRateLimit({
    identity: "anonymous",
    now: now + INVITE_RATE_LIMIT_WINDOW_MS,
    tokenHash: knownToken,
  }),
  true,
);
assert.equal(
  consumeInviteRateLimit({ identity: "anonymous", now, tokenHash: "b".repeat(64) }),
  true,
);

const resetToken = "c".repeat(64);
for (let attempt = 0; attempt < PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
  assert.equal(
    consumePasswordResetRateLimit({ identity: "anonymous", now, tokenHash: resetToken }),
    true,
  );
}
assert.equal(
  consumePasswordResetRateLimit({ identity: "anonymous", now, tokenHash: resetToken }),
  false,
);
assert.equal(
  consumePasswordResetRateLimit({ identity: "untrusted-client", now, tokenHash: resetToken }),
  false,
);

for (let index = 0; index < 10_000; index += 1) {
  const uniqueToken = index.toString(16).padStart(64, "0");
  assert.equal(
    consumePasswordResetRateLimit({ identity: "anonymous", now, tokenHash: uniqueToken }),
    true,
  );
}
assert.equal(
  consumePasswordResetRateLimit({ identity: "anonymous", now, tokenHash: "d".repeat(64) }),
  true,
);

console.log("admin invite/reset rate-limit checks passed");
