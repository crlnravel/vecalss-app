import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSectionHeading,
  ReferenceStatCard,
  ReferenceStatGrid,
  ReferenceSurface,
} from "@/components/dashboard";
import { StudentBadge } from "@/components/ui/student-badge";
import { CalendarDays, ChartColumnBig, ChevronLeft, ChevronRight, PackageCheck, Users } from "@/lib/icons";
import { buttonVariants } from "@/components/ui/button-variants";
import type {
  AffiliatorConversionLog,
  AffiliatorDashboardData,
} from "@/lib/affiliator/service";
import type { SessionContext } from "@/lib/auth/types";
import { AffiliatorReferralCodeCard } from "./components/affiliator-referral-code-card";
import { AffiliatorWorkspaceShell } from "./components/affiliator-workspace-shell";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

const compactDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Jakarta",
});

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "Affiliator";
}

function formatDate(value: Date | null) {
  return value ? dateFormatter.format(value) : "—";
}

function formatCompactDate(value: Date | null) {
  return value ? compactDateFormatter.format(value) : "—";
}

function ConversionLogRow({ conversion }: { conversion: AffiliatorConversionLog }) {
  return (
    <tr className="border-t border-primary-100/80 align-top">
      <td className="px-5 py-4">
        <div className="font-semibold text-secondary-900">{conversion.studentName}</div>
        <div className="mt-1 text-xs leading-5 text-secondary-500">{conversion.studentEmail}</div>
      </td>
      <td className="px-5 py-4">
        <div className="font-medium text-secondary-900">{conversion.packageName}</div>
        <code className="mt-1 block text-xs text-secondary-500">{conversion.packageCode}</code>
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-sm text-secondary-600">
        <time dateTime={conversion.completedAt.toISOString()}>
          {formatDate(conversion.completedAt)}
        </time>
      </td>
      <td className="px-5 py-4">
        <StudentBadge size="sm" tone="success">
          Berhasil
        </StudentBadge>
      </td>
    </tr>
  );
}

function ConversionLog({
  conversionLog,
  page,
  pageCount,
}: {
  conversionLog: AffiliatorConversionLog[];
  page: number;
  pageCount: number;
}) {
  const pageHref = (nextPage: number) => `/affiliator/dashboard?logPage=${nextPage}#conversion-log`;

  return (
    <section aria-labelledby="conversion-log-heading" className="min-w-0 space-y-4" id="conversion-log">
      <ReferenceSectionHeading
        description={`Setiap baris menunjukkan siswa dan paket yang berhasil dibeli menggunakan kode referral kamu. Menampilkan halaman ${page} dari ${pageCount}.`}
        id="conversion-log-heading"
        title="Log pembelian berhasil"
      />

      <ReferenceSurface className="overflow-hidden p-0">
        {conversionLog.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <caption className="sr-only">Daftar pembelian paket yang berhasil menggunakan kode referral</caption>
              <thead className="bg-primary-50/70 text-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase">
                <tr>
                  <th className="px-5 py-4" scope="col">Siswa</th>
                  <th className="px-5 py-4" scope="col">Paket</th>
                  <th className="px-5 py-4" scope="col">Waktu berhasil</th>
                  <th className="px-5 py-4" scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {conversionLog.map((conversion) => (
                  <ConversionLogRow conversion={conversion} key={conversion.id} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ReferenceEmptyState
            description="Saat siswa menyelesaikan pembelian dengan kode ini, riwayat konversinya akan muncul di sini."
            icon={ChartColumnBig}
            title="Belum ada pembelian yang tercatat"
          />
        )}
      </ReferenceSurface>

      {pageCount > 1 ? (
        <nav aria-label="Halaman log pembelian" className="flex items-center justify-end gap-2">
          <span className="mr-1 text-xs font-semibold tabular-nums text-secondary-600">{page} / {pageCount}</span>
          {page > 1 ? (
            <a
              aria-label="Log pembelian sebelumnya"
              className={buttonVariants({ className: "size-10 rounded-2xl p-0", size: "icon-sm", variant: "reference" })}
              href={pageHref(page - 1)}
            >
              <ChevronLeft aria-hidden="true" size={16} />
            </a>
          ) : null}
          {page < pageCount ? (
            <a
              aria-label="Log pembelian berikutnya"
              className={buttonVariants({ className: "size-10 rounded-2xl p-0", size: "icon-sm", variant: "reference" })}
              href={pageHref(page + 1)}
            >
              <ChevronRight aria-hidden="true" size={16} />
            </a>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}

function AffiliatorDashboardPageModule({
  dashboard,
  session,
}: {
  dashboard: AffiliatorDashboardData;
  session: SessionContext;
}) {
  const firstName = getFirstName(session.user.fullName);
  const latestConversion = dashboard.latestConversionAt;

  return (
    <AffiliatorWorkspaceShell
      activeLabel="Dashboard"
      breadcrumbLabel="Dashboard"
      mainClassName="gap-10 lg:gap-12"
      session={session}
    >
      <ReferencePageHeader
        description={`Pantau pembelian siswa yang berhasil menggunakan kode referral kamu, ${firstName}.`}
        title="Dashboard afiliator"
      />

      <ReferenceSurface className="p-5 md:p-7" variant="inset">
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.72fr)] lg:gap-10">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-100 text-primary-800">
                <PackageCheck aria-hidden="true" className="size-5" />
              </span>
              <StudentBadge size="sm" tone="category">
                Kode referral
              </StudentBadge>
            </div>
            <h2 className="mt-5 font-heading text-2xl font-semibold tracking-[-0.03em] text-secondary-900 md:text-3xl">
              Bagikan kode, lihat hasilnya.
            </h2>
            <p className="mt-2 max-w-[52ch] text-sm leading-6 text-secondary-500 md:text-base">
              Kode ini menghubungkan pembelian siswa ke akun affiliator kamu. Riwayat hanya menampilkan pembelian yang sudah berhasil.
            </p>
          </div>

          {dashboard.profile ? (
            <AffiliatorReferralCodeCard
              code={dashboard.profile.referralCode}
              isActive={dashboard.profile.isActive}
            />
          ) : (
            <div className="rounded-3xl border border-student-status-attention-border bg-student-status-attention-bg p-4 text-sm leading-6 text-student-status-attention-fg">
              Kode referral belum tersedia. Hubungi admin untuk mendapatkan kode yang aktif.
            </div>
          )}
        </div>
      </ReferenceSurface>

      <section aria-label="Ringkasan konversi" className="min-w-0">
        <ReferenceStatGrid>
          <ReferenceStatCard
            icon={PackageCheck}
            label="Pembelian berhasil"
            supportingText="Semua paket yang sudah dibayar"
            value={dashboard.successfulPurchaseCount}
          />
          <ReferenceStatCard
            icon={Users}
            label="Siswa berkonversi"
            supportingText="Siswa unik dari log pembelian"
            value={dashboard.uniqueStudentCount}
          />
          <ReferenceStatCard
            icon={CalendarDays}
            label="Aktivitas terakhir"
            supportingText={formatDate(latestConversion)}
            value={formatCompactDate(latestConversion)}
          />
        </ReferenceStatGrid>
      </section>

      <ConversionLog
        conversionLog={dashboard.conversionLog}
        page={dashboard.conversionLogPage}
        pageCount={dashboard.conversionLogPageCount}
      />
    </AffiliatorWorkspaceShell>
  );
}

export { AffiliatorDashboardPageModule };
