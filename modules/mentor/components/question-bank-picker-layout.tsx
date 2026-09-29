import { Checkbox } from "@/components/ui/checkbox";

/** Shared modal frame for importing questions into Kuis and Tryout. */
export const QUESTION_BANK_PICKER_DIALOG_CLASS_NAME =
  "flex max-h-[calc(100svh-1rem)] max-w-5xl flex-col gap-5 overflow-hidden bg-white p-4 sm:max-w-5xl sm:p-6";

export const QUESTION_BANK_PICKER_FOOTER_CLASS_NAME =
  "shrink-0 -mx-4 flex-row items-center justify-between gap-3 border-t border-primary-100 bg-white px-4 py-3 sm:-mx-6 sm:justify-between sm:px-6";

export function QuestionBankPickerRow({
  allInBank,
  checkboxId,
  difficulty,
  disabled,
  onToggle,
  prompt,
  selected,
  subjectCode,
}: {
  allInBank: boolean;
  checkboxId: string;
  difficulty: string;
  disabled: boolean;
  onToggle: () => void;
  prompt: string;
  selected: boolean;
  subjectCode: string;
}) {
  const label = prompt.trim() || "Soal tanpa pertanyaan";

  return (
    <article
      className={`min-w-0 rounded-2xl border p-3 transition-colors ${selected ? "border-primary-300 bg-primary-50/70" : "border-primary-100 bg-white hover:border-primary-200 hover:bg-primary-50/40"}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Checkbox
          aria-label={
            allInBank
              ? `Soal termasuk dalam pilihan semua soal di bank ini: ${label}`
              : selected
                ? `Batalkan pilihan: ${label}`
                : `Pilih: ${label}`
          }
          checked={selected}
          disabled={disabled}
          id={checkboxId}
          onCheckedChange={onToggle}
        />
        <div className="min-w-0 flex-1">
          <label
            className={`block min-w-0 ${disabled ? "cursor-default" : "cursor-pointer"}`}
            htmlFor={checkboxId}
          >
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-primary-100 bg-primary-50 px-2 py-1 font-semibold text-primary-800">
                {subjectCode}
              </span>
              <span className="rounded-full border border-secondary-200 bg-secondary-50 px-2 py-1 font-semibold text-secondary-600">
                {difficulty}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-secondary-900">
              {label}
            </p>
          </label>
        </div>
      </div>
    </article>
  );
}
