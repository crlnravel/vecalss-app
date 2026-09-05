import type { SessionContext } from "@/lib/auth/types";
import type { BannerMakerSnapshot } from "@/lib/admin/banner-maker";
import { updateBannerMakerAction } from "./banner-maker-actions";
import { BannerMakerEditor } from "./components/banner-maker-editor";

function BannerMakerPageModule({
  session,
  snapshot,
}: {
  session: SessionContext;
  snapshot: BannerMakerSnapshot;
}) {
  return (
    <BannerMakerEditor
      action={updateBannerMakerAction}
      assetUrls={snapshot.assetUrls}
      design={snapshot.design}
      hasUnpublishedChanges={snapshot.hasUnpublishedChanges}
      session={session}
      version={snapshot.version}
    />
  );
}

export { BannerMakerPageModule };
