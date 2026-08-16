import { validateStudentBannerFields } from "../lib/student/banner-validation";

const validFields = {
  "beranda.description": "Semangat mengejar {target} ya!",
  "beranda.title": "Halo, {firstName}.",
  "kuis.description": "Pilih latihan yang ingin kamu kerjakan.",
  "kuis.title": "Kuis",
  "materi.description": "Pilih materi yang ingin kamu pelajari.",
  "materi.title": "Materi",
  "tryout.description": "Ukur kesiapanmu lewat simulasi.",
  "tryout.title": "Tryout",
};

const validErrors = validateStudentBannerFields(validFields);
if (Object.keys(validErrors).length > 0) {
  throw new Error(`Expected valid banner copy, got: ${JSON.stringify(validErrors)}`);
}

const invalidErrors = validateStudentBannerFields({
  ...validFields,
  "materi.description": "Hai, {firstName}.",
});
if (!invalidErrors["materi.description"]) {
  throw new Error("Expected non-Beranda template tokens to be rejected.");
}

console.log("student banner validation: ok");
