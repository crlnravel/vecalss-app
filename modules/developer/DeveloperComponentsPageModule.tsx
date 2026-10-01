import type { AccountMenuUser } from "@/modules/student/components/student-account-menu";

import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";

import { ComponentCatalogue } from "./components/component-catalogue";
import { DeveloperWorkspaceShell } from "./components/developer-workspace-shell";

function DeveloperComponentsPageModule({ accountUser }: { accountUser: AccountMenuUser }) {
  return (
    <DeveloperWorkspaceShell activePage="components" accountUser={accountUser}>
      <section aria-labelledby="developer-components-title" className="flex min-w-0 flex-col gap-8">
        <ReferencePageHeader id="developer-components-title" title="Komponen" />
        <ComponentCatalogue />
      </section>
    </DeveloperWorkspaceShell>
  );
}

export { DeveloperComponentsPageModule };
