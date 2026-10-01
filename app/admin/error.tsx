"use client";

import { TypedRouteState } from "@/components/ui/typed-route-state";

function AdminError({ reset }: { reset: () => void }) {
  return (
    <TypedRouteState
      className="workspace-page-canvas"
      description="Status admin saat ini tidak dapat dibaca. Coba muat ulang snapshot; tidak ada tindakan akun yang dilakukan."
      kind="error"
      onRetry={reset}
      returnHref="/admin"
      returnLabel="Kembali ke admin"
      title="Snapshot admin belum tersedia"
    />
  );
}

export default AdminError;
