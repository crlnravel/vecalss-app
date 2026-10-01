import { requireTutorSession } from "@/lib/auth/access";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import styles from "@/modules/mentor/quiz-dashboard.module.css";

export default async function QuizLoading() {
  const session = await requireTutorSession();
  return (
    <MentorWorkspaceShell
      session={session}
      activeLabel="Kuis"
      breadcrumbLabel="Kuis"
      showSearch={false}
      sidebarAppearance="reference"
      mainClassName={styles.canvas}
    >
      <section
        className={styles.panel}
        aria-busy="true"
        aria-label="Memuat daftar kuis"
      >
        <div className={styles.header}>
          <h1 className={styles.title}>Kuis</h1>
        </div>
        <div className={styles.loading} role="status">
          Memuat daftar kuis…
        </div>
      </section>
    </MentorWorkspaceShell>
  );
}
