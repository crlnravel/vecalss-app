"use client";

import Link from "next/link";
import styles from "@/modules/mentor/quiz-dashboard.module.css";

export default function QuizError({ reset }: { reset: () => void }) {
  return <main className={styles.canvas}><section className={styles.panel}><div className={styles.header}><h1 className={styles.title}>Kuis belum dapat dimuat</h1></div><div className={styles.empty} role="alert"><p>Coba lagi untuk membuka daftar kuis.</p><button className={styles.primary} type="button" onClick={reset}>Coba lagi</button> <Link className={styles.button} href="/mentor/quiz">Kembali ke daftar kuis</Link></div></section></main>;
}
