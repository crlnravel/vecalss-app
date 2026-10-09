import type { ComponentProps, ReactNode } from "react";

import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import {
  TryoutWorkspaceHeader,
  type TryoutWorkspaceTab,
} from "@/modules/mentor/KaptenTryoutWorkspaceHeader";

function KaptenTryoutWorkspaceFrame({
  actions,
  activeTab,
  backHref,
  backLabel,
  children,
  initial,
  onNavigate,
  parentId,
}: {
  actions?: ReactNode;
  activeTab: TryoutWorkspaceTab;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  initial: Pick<TryoutOperationsView, "id" | "status" | "title">;
  onNavigate?: ComponentProps<typeof TryoutWorkspaceHeader>["onNavigate"];
  parentId?: string;
}) {
  return (
    <div className="mx-auto min-w-0 w-full max-w-[1420px] px-4 py-6 sm:px-6 lg:px-8">
      <TryoutWorkspaceHeader
        actions={actions}
        activeTab={activeTab}
        backHref={backHref}
        backLabel={backLabel}
        id={initial.id}
        onNavigate={onNavigate}
        parentId={parentId}
        title={initial.title}
      />
      <div className="mt-6 min-w-0">{children}</div>
    </div>
  );
}

export { KaptenTryoutWorkspaceFrame };
