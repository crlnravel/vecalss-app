const PROTOTYPE_QUIZ = {
  id: "0fd79067-01b7-4c26-80c8-36eb04ca49da",
  slug: "quiz-pu-simpulan-implisit-aa33dd68",
};

const PROTOTYPE_ITEMS = [
  ["7dffbad1-d706-49a4-aad8-763efe6a564b", 1, "bank-pu-inferensi-inventory-1"],
  ["cee3939e-033f-4c87-83ce-55e818dad8ba", 2, "bank-pu-inferensi-inventory-2"],
  ["00e34f8f-b9ad-4149-8d5e-8a41833f7f75", 3, "bank-pu-inferensi-inventory-3"],
  ["f68ff250-dd6f-4e8c-8464-62fa5bc12cd6", 4, "bank-pu-inferensi-inventory-4"],
  ["951e947c-1571-4076-8d0a-d4165f919fc0", 5, "bank-pu-inferensi-inventory-5"],
  ["3bdb3791-ab69-4fb2-b3bf-7f73f2ff52b8", 6, "bank-pu-inferensi-inventory-6"],
  ["050079f8-1f24-4d37-90e6-5b65aefe2867", 7, "bank-pu-inferensi-inventory-7"],
  ["ada57198-9fae-4d07-9dfe-983539150a31", 8, "bank-pu-inferensi-inventory-8"],
  ["dbf0db70-dda2-4bd0-b441-d783b7e51faf", 9, "bank-pu-inferensi-inventory-9"],
  ["8bdbee49-3909-40d6-ac06-c2465cb381df", 10, "bank-pu-inferensi-inventory-10"],
  ["af8e88c5-a84c-4fb9-8d22-b8b17d780909", 11, "bank-pu-inferensi-inventory-11"],
  ["1c2ff4d2-bfb5-457b-b72b-44864cce3919", 12, "bank-pu-inferensi-inventory-12"],
].map(([id, sortOrder, sourceId]) => ({ id, sortOrder, sourceId }));

const MUST_BE_EMPTY_TABLES = [
  "standalone_quiz_attempts", "question_banks", "questions", "question_options", "tryout_packages", "tryout_sections",
  "tryout_items", "tryout_sessions", "tryout_answers", "offline_answer_buffers", "tryout_score_breakdowns",
];

const PRESERVED_TABLES = ["topics", "subtests", "modules", "users", "assets", "quiz_items", "quiz_attempts", "quiz_attempt_answers"];

export { MUST_BE_EMPTY_TABLES, PRESERVED_TABLES, PROTOTYPE_ITEMS, PROTOTYPE_QUIZ };
