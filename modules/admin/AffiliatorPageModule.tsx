import type { SessionContext } from "@/lib/auth/types";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { AffiliatorDirectoryTable } from "./components/affiliator-directory-table";

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
      <AffiliatorDirectoryTable affiliators={affiliators.map(person => ({ ...person, createdAt: person.createdAt.toISOString() }))} />
    </PortalShell>
  );
}

export { AffiliatorPageModule };
export type { AffiliatorDirectoryItem };
