import { ArrowDownToLine, FileText } from "@/lib/icons";

import { Button } from "@/components/ui/button";

type CsvTemplateDownloadProps = {
  description?: string;
  fileName?: string;
  href: string;
  title?: string;
};

function CsvTemplateDownload({
  description,
  fileName = "templat-soal.csv",
  href,
  title = "Unduh templat soal",
}: CsvTemplateDownloadProps) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/45 px-4 py-3"
      data-csv-template-download="true"
    >
      <div
        className={description ? "flex min-w-0 items-start gap-3" : "flex min-w-0 items-center gap-3"}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-primary-800 shadow-sm">
          <FileText aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-secondary-900">{title}</p>
          {description ? (
            <p className="mt-0.5 text-xs leading-5 text-secondary-500">{description}</p>
          ) : null}
        </div>
      </div>
      <Button
        aria-label="Unduh templat soal"
        className="shrink-0"
        nativeButton={false}
        render={<a aria-label={title} download={fileName} href={href} />}
        size="sm"
        variant="reference"
      >
        <ArrowDownToLine aria-hidden="true" size={16} />
        Unduh templat
      </Button>
    </div>
  );
}

export { CsvTemplateDownload };
export type { CsvTemplateDownloadProps };
