import type { BankQuestion } from "@/modules/mentor/mock-data";

export type QuestionBankBuilderState = {
  description: string;
  questions: BankQuestion[];
  subjectCode: string;
  title: string;
  topic: string;
};
