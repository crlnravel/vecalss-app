import type { Metadata } from "next";

import { MentorDashboardPageModule } from "@/modules/mentor/MentorDashboardPageModule";

export const metadata: Metadata = {
  title: "Dashboard Kapten | Vecalss LMS",
};

type MentorDashboardMode =
  | "ready"
  | "empty-cohort"
  | "no-selection"
  | "analytics-unavailable"
  | "no-risk";

function parseDashboardMode(value: string | string[] | undefined): MentorDashboardMode {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (
    normalized === "empty-cohort" ||
    normalized === "no-selection" ||
    normalized === "analytics-unavailable" ||
    normalized === "no-risk"
  ) {
    return normalized;
  }

  return "ready";
}

export default async function MentorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;

  return <MentorDashboardPageModule mode={parseDashboardMode(resolvedSearchParams.mode)} />;
}
