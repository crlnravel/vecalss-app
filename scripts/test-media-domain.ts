import assert from "node:assert/strict";

import {
  buildMediaObjectKey,
  imageMediaMimeTypes,
  isImageMimeType,
  isPdfMimeType,
  parseMediaScope,
  validateMediaUpload,
} from "../lib/media/domain";

const run = () => {
  assert.equal(parseMediaScope("kapten"), "kapten");
  assert.equal(parseMediaScope("admin"), "admin");
  assert.equal(parseMediaScope("student"), null);
  assert.equal(isPdfMimeType("application/pdf"), true);
  assert.equal(isImageMimeType("application/pdf"), false);
  assert.equal(imageMediaMimeTypes.map(String).includes("application/pdf"), false);

  assert.deepEqual(
    validateMediaUpload({
      fileName: "diagram.webp",
      mimeType: "image/webp",
      sizeBytes: 1_024,
    }),
    { isValid: true },
  );
  assert.deepEqual(
    validateMediaUpload({
      fileName: "reading.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1_024,
    }),
    { isValid: true },
  );
  const unsupportedMime = validateMediaUpload({
    fileName: "notes.txt",
    mimeType: "text/plain",
    sizeBytes: 1_024,
  });
  assert.equal(unsupportedMime.isValid, false);
  if (!unsupportedMime.isValid) assert.match(unsupportedMime.error, /PDF/i);
  const oversizedPdf = validateMediaUpload({
    fileName: "reading.pdf",
    mimeType: "application/pdf",
    sizeBytes: 15 * 1024 * 1024 + 1,
  });
  assert.equal(oversizedPdf.isValid, false);
  if (!oversizedPdf.isValid) assert.match(oversizedPdf.error, /PDF.*15 MB/i);
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
  assert.equal(
    buildMediaObjectKey("kapten", "7ca953d0-0f55-43a4-a644-28bb3c6f741b", "application/pdf"),
    "kapten/7ca953d0-0f55-43a4-a644-28bb3c6f741b.pdf",
  );

  console.log("media domain checks passed");
};

run();
