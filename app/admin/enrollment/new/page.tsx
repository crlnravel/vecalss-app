import Link from "next/link";

import { ArrowLeft } from "@/lib/icons";
import { requireAdminSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { CreateStudentForm } from "@/modules/admin/components/create-student-form";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  const session = await requireAdminSession();
  const examEvents = await prisma.examEvent.findMany({
    orderBy: [{ examDate: "asc" }, { name: "asc" }],
    where: {
      isActive: true,
    },
  });

  return (
    <PortalShell
      activeAdminSection="students"
      audience="admin"
      description="Create an approved student account and deliver its first credentials."
      session={session}
      title="Add student"
    >
      <div className="space-y-7">
        <Link
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-2 text-sm font-semibold text-secondary-700 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
          href="/admin/enrollment"
        >
          <ArrowLeft aria-hidden="true" size={17} />
          Back to Students
        </Link>

        <header className="max-w-[62ch]">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">
            Add a student to the roster.
          </h1>
          <p className="mt-3 text-sm leading-7 text-secondary-600 sm:text-base">
            Set the student&apos;s exam goal and choose how their first credentials should be delivered.
          </p>
        </header>

        <CreateStudentForm examEvents={examEvents} />
      </div>
    </PortalShell>
  );
}
