import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Versi Baru Paket Soal | Vecalss LMS" };
export default async function PackageEditPage({ params }: { params: Promise<{ packageId: string }> }) { const { packageId } = await params; redirect(`/mentor/packages/${packageId}/versions/new`); }
