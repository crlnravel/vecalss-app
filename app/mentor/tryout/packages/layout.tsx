import { requireTutorSession } from "@/lib/auth/access";

import ArchivedTryoutPackagesNotFound from "./not-found";

/**
 * Legacy Tryout package aliases remain archived and inaccessible to Kapten.
 * The layout renders the archived state itself: a notFound() thrown here would
 * skip this segment's not-found boundary and show the generic Kapten 404.
 */
export default async function ArchivedTryoutPackageLayout() {
  await requireTutorSession();
  return <ArchivedTryoutPackagesNotFound />;
}
