import type { ComponentProps, ReactNode } from "react";

import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import {
  TryoutWorkspaceHeader,
  type TryoutWorkspaceTab,
} from "@/modules/mentor/KaptenTryoutWorkspaceHeader";

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
  initial: Pick<TryoutOperationsView, "id" | "status" | "title">;
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
        title={initial.title}
      />
      <div className="mt-6 min-w-0">{children}</div>
    </div>
  );
}

export { KaptenTryoutWorkspaceFrame };
