const subjectCategoryByCode: Record<string, "TPS" | "TPA"> = {
  PU: "TPS",
  PPU: "TPS",
  PBM: "TPS",
  PK: "TPS",
  LBI: "TPA",
  LBE: "TPA",
  PM: "TPA",
};

function getSubjectCategory(subjectCode: string) {
  return subjectCategoryByCode[subjectCode] ?? subjectCode;
}

export { getSubjectCategory };
