import type { Metadata } from "next";

import AboutPageModule from "@/modules/about/AboutPageModule";

export const metadata: Metadata = {
  title: "About Us | Vecalss LMS",
  description:
    "Learn how Vecalss combines structured university prep, realistic tryouts, analytics, and Vera AI support.",
};

export default function AboutPage() {
  return <AboutPageModule />;
}
