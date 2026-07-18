import assert from "node:assert/strict";

import {
  buildMediaObjectKey,
  parseMediaScope,
  validateMediaUpload,
} from "../lib/media/domain";

const run = () => {
  assert.equal(parseMediaScope("kapten"), "kapten");
  assert.equal(parseMediaScope("admin"), "admin");
  assert.equal(parseMediaScope("student"), null);

  assert.deepEqual(
    validateMediaUpload({
      fileName: "diagram.webp",
      mimeType: "image/webp",
      sizeBytes: 1_024,
    }),
    { isValid: true },
  );
  assert.equal(
    validateMediaUpload({
      fileName: "vector.svg",
      mimeType: "image/svg+xml",
      sizeBytes: 1_024,
    }).isValid,
    false,
  );
  assert.equal(
    validateMediaUpload({
      fileName: "too-large.png",
      mimeType: "image/png",
      sizeBytes: 15 * 1024 * 1024 + 1,
    }).isValid,
    false,
  );

  assert.equal(
    buildMediaObjectKey("kapten", "7ca953d0-0f55-43a4-a644-28bb3c6f741b", "image/png"),
    "kapten/7ca953d0-0f55-43a4-a644-28bb3c6f741b.png",
  );

  console.log("media domain checks passed");
};

run();
