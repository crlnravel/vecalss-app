import {
  getStudentBannerDescription,
  getStudentBannerHeading,
  isStudentBannerDraftUnavailable,
  type AdminStudentBannerRead,
} from "@/lib/student/banner-presentation";
import type { StudentBannerVariables } from "@/lib/student/banner-content";
import { StudentBannerArtwork } from "@/modules/student/components/student-banner-artwork";

type AdminStudentPreviewBannerHeaderProps = {
  banner?: AdminStudentBannerRead;
  description?: string;
  fallbackTitle: string;
  title?: string;
  variables?: StudentBannerVariables;
};

function AdminStudentPreviewBannerHeader({
  banner,
  description,
  fallbackTitle,
  title,
  variables,
}: AdminStudentPreviewBannerHeaderProps) {
  if (banner && isStudentBannerDraftUnavailable(banner)) {
    return (
      <header className="relative isolate overflow-hidden rounded-[2rem] border border-student-status-danger-border bg-student-status-danger-bg px-6 py-7 text-student-status-danger-fg shadow-[0_28px_60px_-38px_color-mix(in_oklab,var(--voyage-deep)_48%,transparent)] md:px-10 md:py-9">
        <div className="relative max-w-2xl">
          <h1 className="text-4xl leading-tight font-extrabold tracking-[-0.045em] md:text-5xl">
            Draf banner tidak tersedia
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 md:text-base">
            {banner.message}
          </p>
        </div>
      </header>
    );
  }

  const resolvedTitle = banner
    ? getStudentBannerHeading(banner, variables)
    : title ?? fallbackTitle;
  const resolvedDescription = banner
    ? getStudentBannerDescription(banner, variables)
    : description ?? "";

  return (
    <header className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,var(--voyage-deep)_0%,var(--voyage-forest)_58%,var(--voyage-leaf)_100%)] px-6 py-7 text-white shadow-[0_28px_60px_-38px_color-mix(in_oklab,var(--voyage-deep)_70%,transparent)] md:px-10 md:py-9">
      {banner?.design ? (
        <StudentBannerArtwork
          banner={banner}
          className="absolute inset-0 size-full rounded-none"
          variables={variables}
        />
      ) : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-[-3rem] size-56 rounded-full border-[18px] border-[var(--voyage-sea-glass)]/15 sm:size-72"
      />
      <div className="relative max-w-2xl">
        <h1
          className={
            banner?.design
              ? "sr-only"
              : "text-4xl leading-tight font-extrabold tracking-[-0.045em] md:text-5xl"
          }
        >
          {resolvedTitle}
        </h1>
        <p
          className={
            banner?.design
              ? "sr-only"
              : "mt-3 max-w-xl text-sm leading-7 text-[var(--primary-50)] md:text-base"
          }
        >
          {resolvedDescription}
        </p>
      </div>
    </header>
  );
}

export { AdminStudentPreviewBannerHeader };
