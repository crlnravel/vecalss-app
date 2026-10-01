"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import styles from "@/modules/mentor/quiz-dashboard.module.css";

export default function QuizError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.canvas}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <h1 className={styles.title}>Kuis belum dapat dimuat</h1>
        </div>
        <div className={styles.empty} role="alert">
          <p>Coba lagi untuk membuka daftar kuis.</p>
          <Button size="sm" type="button" variant="default" onClick={reset}>
            Coba lagi
          </Button>{" "}
          <Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/mentor/quiz">
            Kembali ke daftar kuis
          </Link>
        </div>
      </section>
    </main>
  );
}
