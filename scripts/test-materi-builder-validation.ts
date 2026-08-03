import assert from "node:assert/strict";

import {
  toDocumentInput,
  validateMateriBuilderState,
  type MateriBuilderState,
} from "@/modules/mentor/materi-builder-validation";

const subjects = [{ slug: "penalaran-umum" }];

const baseState: MateriBuilderState = {
  documentAssetId: "",
  documentMimeType: "",
  documentName: "",
  documentSource: "hosted",
  documentUrl: "https://cdn.example.test/materi/reading.pdf",
  subjectSlug: "penalaran-umum",
  title: "Bacaan dasar",
  videoDuration: "",
  videoUrl: "",
};

assert.deepEqual(validateMateriBuilderState(baseState, subjects), {});
assert.deepEqual(toDocumentInput(baseState), {
  hostedUrl: "https://cdn.example.test/materi/reading.pdf",
  mimeType: "",
  originalName: "",
});

const documentOnly = validateMateriBuilderState({ ...baseState, documentUrl: "" }, subjects);
assert.ok(documentOnly.documentUrl, "a hosted source without a URL should fail at the field");

const malformedHosted = validateMateriBuilderState({ ...baseState, documentUrl: "https://cdn.example.test/materi/notes.txt" }, subjects);
assert.ok(malformedHosted.documentUrl, "a hosted non-PDF URL should fail at the field");

const managedState: MateriBuilderState = {
  ...baseState,
  documentAssetId: "kapten-pdf-1",
  documentMimeType: "application/pdf",
  documentName: "reading.pdf",
  documentSource: "managed",
  documentUrl: "",
};
assert.deepEqual(validateMateriBuilderState(managedState, subjects), {});
assert.deepEqual(toDocumentInput(managedState), {
  managedAssetId: "kapten-pdf-1",
  mimeType: "application/pdf",
  originalName: "reading.pdf",
});

const partialVideo = validateMateriBuilderState({ ...baseState, videoUrl: "https://video.example.test/reading.mp4" }, subjects);
assert.ok(partialVideo.videoDuration, "a video URL without duration should fail at duration");

const documentAndVideo = validateMateriBuilderState({
  ...baseState,
  videoDuration: "08:30",
  videoUrl: "https://video.example.test/reading.mp4",
}, subjects);
assert.deepEqual(documentAndVideo, {});

console.log("Materi builder validation checks passed.");
