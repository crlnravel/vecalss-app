import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Paket Soal Kapten | Vecalss LMS" };
export default function PackagePage() { redirect("/mentor/packages"); }
