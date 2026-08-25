import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";

/**
 * Paket Soal is archived for Kapten while the Tryout source model is direct-only.
 * Keep the route tree in place so it can be restored without reintroducing
 * discoverable links or allowing old bookmarks to execute package loaders.
 */
export default async function ArchivedPackageLayout() {
  await requireTutorSession();
  notFound();
}
