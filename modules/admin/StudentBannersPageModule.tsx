"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { ArrowUpRight } from "@/lib/icons";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { StudentBannerEditor } from "./components/student-banner-editor";
import { updateStudentBannersAction } from "./student-banners-actions";

function StudentBannersPageModule({
  banners,
  hasUnpublishedChanges,
  session,
  version,
}: {
  banners: Parameters<typeof StudentBannerEditor>[0]["banners"];
  hasUnpublishedChanges: boolean;
  session: SessionContext;
  version: string | null;
}) {
  return (
    <PortalShell
      activeAdminSection="student-banners"
      audience="admin"
      description="Update the copy shown in the four main student banners."
      session={session}
      title="Student banners"
    >
      <div className="space-y-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">Student page banners</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-600">
              Edit a private draft, preview it with sample student data, then publish when it is ready.
            </p>
          </div>
          <Button
            className="w-fit"
            nativeButton={false}
            render={<Link href="/admin/docs#student-banners" />}
            size="default"
            variant="ghost"
          >
            Read documentation
            <ArrowUpRight aria-hidden="true" size={16} />
          </Button>
        </header>

        <StudentBannerEditor
          action={updateStudentBannersAction}
          banners={banners}
          hasUnpublishedChanges={hasUnpublishedChanges}
          version={version}
        />
      </div>
    </PortalShell>
  );
}

export { StudentBannersPageModule };
