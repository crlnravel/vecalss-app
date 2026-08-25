import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";

/** Legacy Tryout package aliases remain archived and inaccessible to Kapten. */
export default async function ArchivedTryoutPackageLayout() {
  await requireTutorSession();
  notFound();
}
