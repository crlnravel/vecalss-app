import type { Metadata } from "next";

import FaqPageModule from "@/modules/faq/FaqPageModule";

export const metadata: Metadata = {
  title: "FAQ | Vecalss LMS",
  description:
    "Answers to common questions about Vecalss programs, Vera AI support, tryouts, analytics, and how to get started.",
};

export default function FaqPage() {
  return <FaqPageModule />;
}
