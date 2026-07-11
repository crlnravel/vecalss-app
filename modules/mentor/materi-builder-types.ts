export type MateriSectionKind = "video" | "notes" | "attachment" | "practice";

export type MateriBuilderSection = {
  assetId?: string;
  body: string;
  id: string;
  kind: MateriSectionKind;
  prompt?: string;
  title: string;
  videoUrl?: string;
};

export type MateriBuilderState = {
  description: string;
  sections: MateriBuilderSection[];
  subjectCode: string;
  title: string;
};
