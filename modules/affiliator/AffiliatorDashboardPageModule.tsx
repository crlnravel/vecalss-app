import Link from "next/link";

import {
  ReferencePageHeader,
  ReferenceSectionHeading,
  ReferenceSurface,
} from "@/components/dashboard";
import { ArrowRight } from "@/lib/icons";
import type {
  AffiliatorDashboardData,
} from "@/lib/affiliator/service";
import type { SessionContext } from "@/lib/auth/types";
import { AffiliatorDashboardCharts } from "./components/affiliator-dashboard-charts";
import { AffiliatorReferralCodeCard } from "./components/affiliator-referral-code-card";
import { AffiliatorWorkspaceShell } from "./components/affiliator-workspace-shell";

const compactDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Jakarta",
});

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function formatCompactDate(value: Date | null) {
  return value ? compactDateFormatter.format(value) : "—";
}

function AffiliatorStatistics({ dashboard }: { dashboard: AffiliatorDashboardData }) {
  const latestConversion = dashboard.latestConversionAt;

  return (
    <section aria-labelledby="affiliator-statistics-heading" className="min-w-0 space-y-4">
      <ReferenceSectionHeading
        action={
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-primary-800 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35"
            href="/affiliator/log-pembelian"
          >
            Lihat log
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        }
        id="affiliator-statistics-heading"
        title="Statistik"
      />

      <dl className="grid gap-3 sm:grid-cols-3">
        <ReferenceSurface as="div" className="min-w-0 p-5 sm:p-6" variant="inset">
          <dt className="text-sm text-secondary-500">Pembelian berhasil</dt>
          <dd className="mt-3 font-heading text-4xl font-semibold tracking-[-0.04em] text-secondary-900 tabular-nums">
            {dashboard.successfulPurchaseCount}
          </dd>
          <p className="mt-1 text-xs text-secondary-500">Paket dibayar</p>
        </ReferenceSurface>
        <ReferenceSurface as="div" className="min-w-0 p-5 sm:p-6" variant="inset">
          <dt className="text-sm text-secondary-500">Siswa unik</dt>
          <dd className="mt-3 font-heading text-4xl font-semibold tracking-[-0.04em] text-secondary-900 tabular-nums">
            {dashboard.uniqueStudentCount}
          </dd>
          <p className="mt-1 text-xs text-secondary-500">Dari kode referral</p>
        </ReferenceSurface>
        <ReferenceSurface as="div" className="min-w-0 p-5 sm:p-6" variant="inset">
          <dt className="text-sm text-secondary-500">Aktivitas terakhir</dt>
          <dd className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em] text-secondary-900">
            {formatCompactDate(latestConversion)}
          </dd>
          <p className="mt-1 text-xs text-secondary-500">
            {latestConversion ? timeFormatter.format(latestConversion) : "Belum ada"}
          </p>
        </ReferenceSurface>
      </dl>
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
  return (
    <AffiliatorWorkspaceShell
      activeLabel="Dashboard"
      breadcrumbLabel="Dashboard"
      mainClassName="gap-10 lg:gap-12"
      session={session}
    >
      <ReferencePageHeader title="Dashboard" />

      {dashboard.profile ? (
        <AffiliatorReferralCodeCard
          code={dashboard.profile.referralCode}
          isActive={dashboard.profile.isActive}
        />
      ) : (
        <ReferenceSurface
          aria-label="Status kode referral"
          className="p-4 text-sm text-student-status-attention-fg"
          role="status"
          variant="inset"
        >
          Kode referral belum tersedia. Hubungi admin.
        </ReferenceSurface>
      )}

      <AffiliatorStatistics dashboard={dashboard} />
      <AffiliatorDashboardCharts
        conversionBreakdown={dashboard.conversionBreakdown}
        conversionTrend={dashboard.conversionTrend}
        packageMix={dashboard.packageMix}
      />
    </AffiliatorWorkspaceShell>
  );
}

export { AffiliatorDashboardPageModule };
