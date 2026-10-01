import Link from "next/link";
import { Check, ChevronLeft } from "@/lib/icons";
import { packageReleaseLabel } from "@/lib/tryout/version-label";

import {
  ReferencePageHeader,
  ReferenceSectionHeading,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Detail = {
  items: Array<{ difficulty: string; options: Array<{ choiceKey: string; content: string; isCorrect: boolean }>; pointValue: number; prompt: string; sortOrder: number }>;
  packageId: string;
  packageTitle: string;
  sourceBankName: string;
  subtest: string;
  versionNo: number;
};

function KaptenPackageVersionDetailModule({ detail }: { detail: Detail }) {
  return (
    <div className="space-y-5">
      <Button aria-label="Kembali ke versi Paket" nativeButton={false} render={<Link href={`/mentor/packages/${detail.packageId}`} />} size="icon" title="Kembali ke versi Paket" variant="outline"><ChevronLeft /></Button>
      <ReferencePageHeader
        actions={<Badge size="sm" tone="category">{packageReleaseLabel(detail.versionNo)}</Badge>}
        title={detail.packageTitle}
      />
      <ReferenceSurface as="section" aria-label="Ringkasan versi" className="p-5 sm:p-7">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-secondary-500">Bank</dt><dd className="mt-1 font-semibold text-secondary-900">{detail.sourceBankName}</dd></div>
          <div><dt className="text-secondary-500">Subtes</dt><dd className="mt-1 font-semibold text-secondary-900">{detail.subtest}</dd></div>
          <div><dt className="text-secondary-500">Soal</dt><dd className="mt-1 font-semibold text-secondary-900">{detail.items.length}</dd></div>
        </dl>
      </ReferenceSurface>
      <ReferenceSurface as="section" aria-labelledby="package-version-questions-heading" className="p-5 sm:p-7">
        <ReferenceSectionHeading
          action={<Badge aria-label={`${detail.items.length} soal`} size="xs" tone="category">{detail.items.length} soal</Badge>}
          id="package-version-questions-heading"
          title="Soal"
        />
        {detail.items.length ? (
          <ol className="mt-5 grid gap-3">
            {detail.items.map((item) => (
              <li className="rounded-2xl bg-primary-50/70 p-4 sm:p-5" key={item.sortOrder}>
                <div className="flex items-start gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-primary-800">{item.sortOrder}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm leading-6 text-secondary-900">{item.prompt}</p>
                      <span className="shrink-0 text-sm font-semibold text-primary-800">{item.pointValue} poin</span>
                    </div>
                    <ul className="mt-3 grid gap-2">
                      {item.options.map((option) => (
                        <li className={option.isCorrect ? "flex min-w-0 items-start gap-2 rounded-xl bg-white px-3 py-2 text-sm text-primary-900" : "flex min-w-0 items-start gap-2 rounded-xl bg-secondary-50 px-3 py-2 text-sm text-secondary-700"} key={option.choiceKey}>
                          <span className="shrink-0 font-semibold">{option.choiceKey}.</span>
                          <span className="min-w-0 flex-1">{option.content}</span>
                          {option.isCorrect ? <Check aria-label="Jawaban benar" className="ml-auto size-4 shrink-0 text-primary-700" /> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="mt-4 text-sm text-secondary-500">Versi ini belum memiliki soal.</p>}
      </ReferenceSurface>
    </div>
  );
}

export { KaptenPackageVersionDetailModule };
