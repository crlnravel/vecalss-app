import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fieldLabelClassName } from "@/components/ui/field-constants";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import styles from "@/modules/mentor/quiz-dashboard.module.css";

const columns = [
  { label: "", width: 40 },
  { label: "Kuis", width: undefined },
  { label: "Subtes", width: 100 },
  { label: "Pembuat", width: 88 },
  { label: "Pengerjaan", width: 115 },
  { label: "Rata-rata", width: 115 },
  { label: "Status", width: 140 },
  { label: "", width: 60 },
];

export default function QuizLoading() {
  return (
    <MentorWorkspaceShell
      session={null}
      activeLabel="Kuis"
      breadcrumbLabel="Kuis"
      showSearch={false}
      sidebarAppearance="reference"
      mainClassName={styles.canvas}
    >
      <ReferencePageHeader
        className={styles.pageHeader}
        title="Kuis"
        titleClassName="font-display text-4xl font-extrabold tracking-[-0.04em] text-voyage-ink text-balance md:text-5xl"
        actions={
          <Skeleton
            aria-hidden="true"
            className="h-[44px] w-[120px] motion-reduce:animate-none"
          />
        }
      />
      <section
        className={`${styles.panel} [&_[data-slot=skeleton]]:motion-reduce:animate-none`}
        aria-busy="true"
        aria-label="Memuat daftar kuis"
        data-quiz-dashboard-skeleton
      >
        <p className="sr-only" role="status">
          Memuat daftar kuis…
        </p>
        <div aria-hidden="true">
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <Skeleton className="h-[44px] w-full" />
            </div>
            <div className={styles.filters}>
              <Skeleton className="h-[40px] w-[128px]" />
              <Skeleton className="h-[40px] w-[80px]" />
            </div>
          </div>
          <div className={styles.viewport}>
            <Table className={styles.table} density="compact">
              <colgroup>
                {columns.map((column, index) => (
                  <col key={index} style={{ width: column.width }} />
                ))}
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {columns.map((column, index) => (
                    <TableHead
                      key={index}
                      className={`${fieldLabelClassName} text-[12px] ${index === 0 ? styles.selectionCell : index === 1 ? styles.titleCell : ""}`}
                      data-numeric={index === 4 || index === 5}
                    >
                      {index === 0 ? (
                        <Skeleton className="size-[15px] rounded-detail" />
                      ) : (
                        column.label
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[75, 90, 65, 80, 70, 85].map((width, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell className={styles.selectionCell}>
                      <Skeleton className="size-[15px] rounded-detail" />
                    </TableCell>
                    <TableCell className={styles.titleCell}>
                      <Skeleton
                        className="h-[16px] max-w-full"
                        style={{ width: `${width}%` }}
                      />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-[14px] w-[32px]" />
                    </TableCell>
                    <TableCell>
                      <div className="flex size-[44px] items-center justify-center">
                        <Skeleton className="size-[32px] rounded-pill" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="ml-auto h-[12px] w-[24px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="ml-auto h-[12px] w-[24px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-[24px] w-[54px] rounded-pill" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="mx-auto h-[12px] w-[20px]" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className={styles.footer}>
            <div className={styles.pageSize}>
              <Skeleton className="h-[14px] w-[116px]" />
              <Skeleton className="h-[40px] w-[52px]" />
            </div>
            <div className={styles.pagination}>
              <Skeleton className={`${styles.range} h-[12px] w-[76px]`} />
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="size-[40px]" />
              ))}
            </div>
          </div>
        </div>
      </section>
    </MentorWorkspaceShell>
  );
}
