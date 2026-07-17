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
  duration: string;
  position: string;
  sectionId: string;
  subjectSlug: string;
  title: string;
  videoUrl: string;
};
