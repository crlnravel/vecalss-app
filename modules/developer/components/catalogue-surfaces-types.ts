import type { ReactNode } from "react";

export type CatalogueSurfaceSection = {
  id: string;
  title: string;
  description: string;
  sources: string[];
  preview: ReactNode;
};
