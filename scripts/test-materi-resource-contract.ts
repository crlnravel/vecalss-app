import assert from "node:assert/strict";

import {
  MATERI_DOCUMENT_MIME_TYPE,
  isMateriReady,
  normalizeMateriDocumentInput,
  readMateriResources,
  validateMateriVideoInput,
} from "@/lib/materi/contract";

const hostedDocument = normalizeMateriDocumentInput({
  hostedUrl: "https://cdn.example.test/materi/reading.pdf?download=1",
});
assert.ok(hostedDocument.document, "a hosted PDF should normalize");
assert.equal(hostedDocument.document.sourceKind, "hosted");
assert.equal(hostedDocument.document.mimeType, MATERI_DOCUMENT_MIME_TYPE);

const documentOnlyResources = readMateriResources([{
  assetType: "attachment",
  mediaUrl: hostedDocument.document.url,
  mimeType: hostedDocument.document.mimeType,
  originalName: "reading.pdf",
  sourceKind: "hosted",
}]);
assert.equal(documentOnlyResources.video, null, "video is optional");
assert.equal(isMateriReady("Document-only lesson", documentOnlyResources), true);

const videoPair = validateMateriVideoInput({
  duration: "08:30",
  url: "https://video.example.test/reading.mp4",
});
assert.ok(videoPair.video, "a complete optional video pair should validate");
const documentAndVideoResources = readMateriResources([{
  assetType: "video",
  durationSeconds: videoPair.video.durationSeconds,
  mediaUrl: videoPair.video.mediaUrl,
}, {
  assetType: "attachment",
  mediaUrl: hostedDocument.document.url,
  mimeType: hostedDocument.document.mimeType,
  sourceKind: "hosted",
}]);
assert.equal(isMateriReady("Document plus video", documentAndVideoResources), true);
assert.equal(documentAndVideoResources.document?.sourceKind, "hosted", "resource role must not depend on array order");

const validManagedDocument = readMateriResources([{
  assetType: "attachment",
  managedAssetId: "kapten-pdf-1",
  mimeType: MATERI_DOCUMENT_MIME_TYPE,
  sourceKind: "managed",
  managedAsset: {
    libraryScope: "kapten",
    mimeType: MATERI_DOCUMENT_MIME_TYPE,
    objectKey: "kapten/kapten-pdf-1.pdf",
    originalName: "kapten-pdf-1.pdf",
    state: "ready",
    trashedAt: null,
  },
}]);
assert.ok(validManagedDocument.document, "a ready Kapten managed PDF should be readable");
assert.equal(validManagedDocument.document?.sourceKind, "managed");
assert.equal(isMateriReady("Managed document", validManagedDocument), true);

const urlOnlyManagedDocument = readMateriResources([{
  assetType: "attachment",
  managedAssetId: "kapten-pdf-url-only",
  mimeType: MATERI_DOCUMENT_MIME_TYPE,
  sourceKind: "managed",
  managedAsset: {
    libraryScope: "kapten",
    mimeType: MATERI_DOCUMENT_MIME_TYPE,
    objectKey: null,
    originalName: "kapten-pdf-url-only.pdf",
    state: "ready",
    trashedAt: null,
    url: "https://cdn.example.test/materi/kapten-pdf-url-only.pdf",
  },
}]);
assert.equal(urlOnlyManagedDocument.document, null, "managed PDFs require an R2 object key even when a URL is present");
assert.equal(isMateriReady("URL-only managed document", urlOnlyManagedDocument), false);

const adminScopedManagedDocument = readMateriResources([{
  assetType: "attachment",
  managedAssetId: "admin-pdf-1",
  mimeType: MATERI_DOCUMENT_MIME_TYPE,
  sourceKind: "managed",
  managedAsset: {
    libraryScope: "admin",
    mimeType: MATERI_DOCUMENT_MIME_TYPE,
    objectKey: "admin/admin-pdf-1.pdf",
    originalName: "admin-pdf-1.pdf",
    state: "ready",
    trashedAt: null,
  },
}]);
assert.equal(adminScopedManagedDocument.document, null, "admin-scoped managed PDFs must not enter Materi reads");
assert.equal(isMateriReady("Wrong-scope document", adminScopedManagedDocument), false);

assert.equal(isMateriReady("Ambiguous documents", readMateriResources([
  { assetType: "attachment", mediaUrl: "https://cdn.example.test/a.pdf", mimeType: MATERI_DOCUMENT_MIME_TYPE, sourceKind: "hosted" },
  { assetType: "attachment", mediaUrl: "https://cdn.example.test/b.pdf", mimeType: MATERI_DOCUMENT_MIME_TYPE, sourceKind: "hosted" },
])), false);

const missingDocument = normalizeMateriDocumentInput(undefined);
assert.equal(missingDocument.document, null);
assert.ok(missingDocument.errors.document);
assert.equal(isMateriReady("Missing document", readMateriResources([])), false);

const malformedDocument = normalizeMateriDocumentInput({ hostedUrl: "not-a-pdf" });
assert.equal(malformedDocument.document, null);
assert.ok(malformedDocument.errors.documentUrl);
assert.equal(isMateriReady("Malformed document", readMateriResources([{
  assetType: "attachment",
  mediaUrl: "https://cdn.example.test/materi/notes.txt",
  sourceKind: "hosted",
}])), false);

const missingVideoDuration = validateMateriVideoInput({
  url: "https://video.example.test/reading.mp4",
});
assert.equal(missingVideoDuration.video, null);
assert.ok(missingVideoDuration.errors.videoDuration);

const missingVideoUrl = validateMateriVideoInput({ duration: "08:30", url: "" });
assert.equal(missingVideoUrl.video, null);
assert.ok(missingVideoUrl.errors.videoUrl);

const malformedVideoDuration = validateMateriVideoInput({
  duration: "00:00",
  url: "https://video.example.test/reading.mp4",
});
assert.equal(malformedVideoDuration.video, null);
assert.ok(malformedVideoDuration.errors.videoDuration);

const trashedManagedDocument = readMateriResources([{
  assetType: "attachment",
  managedAssetId: "managed-pdf-1",
  mimeType: MATERI_DOCUMENT_MIME_TYPE,
  sourceKind: "managed",
  managedAsset: {
    libraryScope: "kapten",
    mimeType: MATERI_DOCUMENT_MIME_TYPE,
    objectKey: "kapten/managed-pdf-1.pdf",
    state: "trashed",
    trashedAt: new Date(),
  },
}]);
assert.equal(trashedManagedDocument.document, null);
assert.equal(isMateriReady("Unavailable managed document", trashedManagedDocument), false);

console.log("Materi resource contract checks passed.");
