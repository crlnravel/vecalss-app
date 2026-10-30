import type { ComponentProps, ReactNode } from "react";

import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { MediaAssetPreview } from "@/modules/media/media-library";
import { TryoutIdentityHeader } from "@/modules/mentor/components/tryout-identity-header";
import {
  TryoutWorkspaceHeader,
  type TryoutWorkspaceTab,
} from "@/modules/mentor/KaptenTryoutWorkspaceHeader";

/** Read-only counterpart of the identity panel (banner, title, description) shown on the main workspace tabs. */
function KaptenTryoutWorkspaceHero({
  initial,
}: {
  initial: Pick<TryoutOperationsView, "bannerMediaId" | "description" | "status" | "title">;
}) {
  return (
    <TryoutIdentityHeader
      status={initial.status}
      title={<h1 className="reference-page-title min-w-0 break-words">{initial.title || "Tryout tanpa judul"}</h1>}
    >
      {initial.bannerMediaId ? (
        <div className="relative aspect-[6/1] min-h-40 min-w-0 max-w-full overflow-hidden rounded-3xl border border-primary-100 bg-primary-50 sm:min-h-48">
          <MediaAssetPreview
            alt="Banner Tryout"
            assetId={initial.bannerMediaId}
            className="absolute inset-0 min-h-0 min-w-0 w-full max-w-full [&_img]:object-cover"
          />
        </div>
      ) : null}
      <div>
        <span className="text-xs font-semibold text-secondary-500">Deskripsi</span>
        <p className="mt-1 text-sm leading-6 text-secondary-700">
          {initial.description || (
            <span className="italic text-secondary-400">Belum ada deskripsi untuk Tryout ini.</span>
          )}
        </p>
      </div>
    </TryoutIdentityHeader>
  );
}

function KaptenTryoutWorkspaceFrame({
  actions,
  activeTab,
  children,
  initial,
  onNavigate,
  parentId,
}: {
  actions?: ReactNode;
  activeTab: TryoutWorkspaceTab;
  children: ReactNode;
  initial: Pick<TryoutOperationsView, "bannerMediaId" | "description" | "id" | "status" | "title">;
  onNavigate?: ComponentProps<typeof TryoutWorkspaceHeader>["onNavigate"];
  parentId?: string;
}) {
  return (
    <div className="min-w-0 w-full">
      <TryoutWorkspaceHeader
        actions={actions}
        activeTab={activeTab}
        id={initial.id}
        onNavigate={onNavigate}
        parentId={parentId}
        showTitle={false}
        title={initial.title}
      >
        <KaptenTryoutWorkspaceHero initial={initial} />
      </TryoutWorkspaceHeader>
      <div className="mt-6 min-w-0">{children}</div>
    </div>
  );
}

export { KaptenTryoutWorkspaceFrame };
