import assert from "node:assert/strict";

import { withMateriDocumentDeliveryMode } from "@/lib/materi/document-preview";

assert.equal(
  withMateriDocumentDeliveryMode("/api/courses/pu/unit-1/document", "pdf"),
  "/api/courses/pu/unit-1/document?format=pdf",
  "PDF previews must request the API's PDF response format.",
);
assert.equal(
  withMateriDocumentDeliveryMode("/api/courses/pu/unit-1/document?assetId=asset-1", "pdf"),
  "/api/courses/pu/unit-1/document?assetId=asset-1&format=pdf",
  "PDF preview mode must preserve an existing asset query.",
);
assert.equal(
  withMateriDocumentDeliveryMode("/api/courses/pu/unit-1/document", "download"),
  "/api/courses/pu/unit-1/document?download=1",
  "PDF downloads must retain the download response mode.",
);

console.log("PASS materi PDF preview delivery contract");
