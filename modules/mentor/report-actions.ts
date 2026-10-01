"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth/session";
import { hasTutorReportSubmissionAccess } from "@/lib/reports/access";
import { createMentorReport } from "@/lib/reports/service";
import { validateMentorReportSubmission } from "@/lib/reports/validation";

async function submitMentorReportAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false, message: "Sesi berakhir. Masuk kembali untuk mengirim laporan." };
  }
  if (session.user.mustChangePassword) {
    return { ok: false, message: "Ubah kata sandi sebelum mengirim laporan." };
  }
  if (!hasTutorReportSubmissionAccess(session.user.roles)) {
    return { ok: false, message: "Gunakan akun Kapten untuk mengirim laporan." };
  }

  const validation = await validateMentorReportSubmission(formData);
  if (!validation.ok) return validation;

  try {
    await createMentorReport(session.user.id, validation.value);
  } catch {
    return { ok: false, message: "Laporan belum terkirim. Coba lagi sebentar." };
  }

  revalidatePath("/developer/reports");
  return { ok: true, message: "Laporan terkirim." };
}

export { submitMentorReportAction };
