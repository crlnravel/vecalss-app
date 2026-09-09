"use client";

import { BannerPresentation } from "./banner-presentation";
import type { StudentBannerPresentation } from "@/lib/student/banner-presentation";
import type { StudentBannerVariables } from "@/lib/student/banner-content";

function StudentBannerArtwork({
  banner,
  className,
  variables,
}: {
  banner: StudentBannerPresentation;
  className?: string;
  variables?: StudentBannerVariables;
}) {
  if (!banner.design || !banner.revision) return null;

  return (
    <BannerPresentation
      assets={banner.assets}
      className={className}
      design={banner.design}
      destination={banner.destination}
      fallback={banner.fallback}
      revision={banner.revision}
      variables={variables}
    />
  );
}

export { StudentBannerArtwork };
