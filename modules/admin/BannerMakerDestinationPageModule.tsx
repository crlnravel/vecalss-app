import { randomUUID } from "node:crypto";

import type { SessionContext } from "@/lib/auth/types";
import type { BannerMakerDestinationSnapshot } from "@/lib/admin/banner-maker";
import { updateBannerMakerDestinationAction } from "./banner-maker-actions";
import { BannerMakerDestinationEditor } from "./components/banner-maker-destination-editor";

function BannerMakerDestinationPageModule({
  session,
  snapshot,
}: {
  session: SessionContext;
  snapshot: BannerMakerDestinationSnapshot;
}) {
  return <BannerMakerDestinationEditor action={updateBannerMakerDestinationAction} requestId={randomUUID()} session={session} snapshot={snapshot} />;
}

export { BannerMakerDestinationPageModule };
