import { requireTutorSession } from "@/lib/auth/access";

import ArchivedPackagesNotFound from "./not-found";

/**
 * Paket Soal is archived for Kapten while the Tryout source model is direct-only.
 * Keep the route tree in place so it can be restored without reintroducing
 * discoverable links or allowing old bookmarks to execute package loaders.
 * The layout renders the archived state itself: a notFound() thrown here would
 * skip this segment's not-found boundary and show the generic Kapten 404.
 */
export default async function ArchivedPackageLayout() {
  await requireTutorSession();
  return <ArchivedPackagesNotFound />;
}
