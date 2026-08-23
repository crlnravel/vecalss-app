/** The single user-facing root meaning of a nullable QuestionBank folder. */
export const QUESTION_BANK_ROOT_LABEL = "Bank soal" as const;

export function questionBankFolderLabel(
  folderId: string | null,
  folderName?: string | null,
) {
  return folderId === null ? QUESTION_BANK_ROOT_LABEL : folderName?.trim() ?? "";
}
