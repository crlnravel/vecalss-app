import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import {
  readQueryValues,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { listTryouts } from "@/lib/tryout/repository";
import { KaptenTryoutCataloguePageModule } from "@/modules/mentor/KaptenTryoutCataloguePageModule";

export const metadata: Metadata = {
  title: "Tryout Kapten | Vecalss LMS",
};

export default async function MentorTryoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const [session, query] = await Promise.all([
    requireTutorSession(),
    searchParams,
  ]);
  const initialItems = await listTryouts(session.user.id);
  const createValues = readQueryValues(query, "create");

  return (
    <KaptenTryoutCataloguePageModule
      initialCreateDialogOpen={
        createValues.length === 1 && createValues[0] === "1"
      }
      initialItems={initialItems}
      session={session}
    />
  );
}
