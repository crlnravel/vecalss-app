import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard";
import { StudentBadge } from "@/components/ui/student-badge";
import { Share2 } from "@/lib/icons";
import type { SessionContext } from "@/lib/auth/types";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { AddAffiliatorDialog } from "./components/add-affiliator-dialog";

type AffiliatorDirectoryItem = {
  createdAt: Date;
  email: string;
  fullName: string;
  id: string;
  packagePurchaseCount: number;
  referralCode: string | null;
  referralCodeIsActive: boolean;
  status: string;
};

function AffiliatorPageModule({
  affiliators,
  session,
}: {
  affiliators: AffiliatorDirectoryItem[];
  session: SessionContext;
}) {
  return (
    <PortalShell
      activeAdminSection="affiliators"
      audience="admin"
      description="Kelola akun affiliator dan kode referral yang menghubungkan pembelian siswa."
      session={session}
      title="Affiliator"
    >
      <div className="space-y-8">
        <ReferencePageHeader
          actions={<AddAffiliatorDialog />}
          description="Setiap affiliator memiliki satu kode referral aktif untuk melacak pembelian siswa yang berhasil."
          title="Affiliator"
        />

        <ReferenceSurface as="section" aria-label="Direktori affiliator" className="overflow-hidden p-0">
          {affiliators.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <caption className="sr-only">Daftar akun affiliator dan performa pembeliannya</caption>
                <thead className="bg-primary-50/70 text-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase">
                  <tr>
                    <th className="px-5 py-4" scope="col">Affiliator</th>
                    <th className="px-5 py-4" scope="col">Kode referral</th>
                    <th className="px-5 py-4" scope="col">Pembelian berhasil</th>
                    <th className="px-5 py-4" scope="col">Status akun</th>
                  </tr>
                </thead>
                <tbody>
                  {affiliators.map((affiliator) => (
                    <tr className="border-t border-primary-100/80 align-top" key={affiliator.id}>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-secondary-900">{affiliator.fullName}</div>
                        <div className="mt-1 text-xs leading-5 text-secondary-500">{affiliator.email}</div>
                      </td>
                      <td className="px-5 py-4">
                        {affiliator.referralCode ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="font-semibold text-secondary-800">{affiliator.referralCode}</code>
                            <StudentBadge size="xs" tone={affiliator.referralCodeIsActive ? "success" : "neutral"}>
                              {affiliator.referralCodeIsActive ? "Aktif" : "Nonaktif"}
                            </StudentBadge>
                          </div>
                        ) : (
                          <StudentBadge size="xs" tone="attention">Belum ada kode</StudentBadge>
                        )}
                      </td>
                      <td className="px-5 py-4 font-semibold tabular-nums text-secondary-800">{affiliator.packagePurchaseCount}</td>
                      <td className="px-5 py-4">
                        <StudentBadge size="sm" tone={affiliator.status === "active" ? "success" : "attention"}>
                          {affiliator.status === "active" ? "Aktif" : "Nonaktif"}
                        </StudentBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ReferenceEmptyState
              description="Gunakan tombol tambah di atas untuk membuat akun affiliator dan menetapkan kode referral pertamanya."
              icon={Share2}
              title="Belum ada akun affiliator"
            />
          )}
        </ReferenceSurface>
      </div>
    </PortalShell>
  );
}

export { AffiliatorPageModule };
export type { AffiliatorDirectoryItem };
