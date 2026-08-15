import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/access";

export const metadata: Metadata = {
  title: "Media | Vecalss LMS",
};

export default async function AdminMediaPage() {
  await requireAdminSession();
  redirect("/admin");
}
