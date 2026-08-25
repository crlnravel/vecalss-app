import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Paket Soal Kapten | Vecalss LMS" };

export default async function PackageUsePage({ params }: { params: Promise<{ packageId: string }> }) {
  const [{ packageId }] = await Promise.all([params, requireTutorSession()]);
  redirect(`/mentor/packages/${packageId}`);
}
