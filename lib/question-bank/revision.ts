import "server-only";

import { createHash } from "node:crypto";

type QuestionRevisionDigestOption = {
  assetId?: string | null;
  content: string;
  isCorrect: boolean;
  label: string;
  sortOrder: number;
};

type QuestionRevisionDigestInput = {
  difficulty: string;
  explanation?: string | null;
  explanationAssetId?: string | null;
  options: readonly QuestionRevisionDigestOption[];
  prompt: string;
  promptAssetId?: string | null;
  questionType: string;
};

function digestPart(value: string) {
  return Buffer.from(value, "utf8").toString("hex");
}

function questionRevisionContentDigest(input: QuestionRevisionDigestInput) {
  const parts = [
    "question-revision-digest-v1",
    input.difficulty,
    input.explanation ?? "",
    input.explanationAssetId ?? "",
    ...[...input.options]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
      .flatMap((option) => [
        option.assetId ?? "",
        option.content,
        String(option.isCorrect),
        option.label,
        String(option.sortOrder),
      ]),
    input.prompt,
    input.promptAssetId ?? "",
    input.questionType,
  ];

  return createHash("sha256")
    .update(parts.map(digestPart).join(":"), "utf8")
    .digest("hex");
}

export { questionRevisionContentDigest };
export type { QuestionRevisionDigestInput, QuestionRevisionDigestOption };
