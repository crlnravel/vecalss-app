"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { isQuestionBankPurpose, questionBankNavigationLabel, type QuestionBankPurpose } from "@/lib/question-bank/purpose";
import styles from "@/modules/mentor/quiz-dashboard.module.css";

function QuestionBankRecovery({ purpose, reset }: { purpose?: QuestionBankPurpose; reset: () => void }) {
  const purposes: QuestionBankPurpose[] = purpose ? [purpose] : ["quiz", "tryout"];
  return (
    <main className={`${styles.canvas} workspace-page-canvas`}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <h1 className={styles.title}>Bank Soal belum dapat dimuat</h1>
        </div>
        <div className={styles.empty} role="alert">
          <p>Coba lagi atau kembali ke daftar Bank Soal.</p>
          <Button onClick={reset} size="sm" type="button" variant="default">Coba lagi</Button>{" "}
          {purposes.map((bankPurpose) => (
            <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/mentor/quiz/question-bank?purpose=${bankPurpose}`} key={bankPurpose}>
              Kembali ke {questionBankNavigationLabel(bankPurpose)}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function QuestionBankErrorContext({ reset }: { reset: () => void }) {
  const searchParams = useSearchParams();
  const purposes = searchParams.getAll("purpose");
  const purpose = purposes.length === 1 && isQuestionBankPurpose(purposes[0]) ? purposes[0] : undefined;
  return <QuestionBankRecovery purpose={purpose} reset={reset} />;
}

export default function QuestionBankError({ reset }: { reset: () => void }) {
  return (
    <Suspense fallback={<QuestionBankRecovery reset={reset} />}>
      <QuestionBankErrorContext reset={reset} />
    </Suspense>
  );
}
