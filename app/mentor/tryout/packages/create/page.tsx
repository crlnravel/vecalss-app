import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Buat Paket Soal | PTN Pro LMS" };
export default function CreatePackagePage() { redirect("/mentor/packages/create"); }
