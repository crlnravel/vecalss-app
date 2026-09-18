import type {
  AffiliatorConversionTrendPoint,
  AffiliatorPackageMixItem,
} from "@/lib/affiliator/service";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

const numberFormatter = new Intl.NumberFormat("id-ID");

function formatTrendDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00+07:00`));
}

function trendDescription(trend: AffiliatorConversionTrendPoint[]) {
  if (!trend.length) return "Belum ada konversi.";

  return trend
    .map((point) => `${formatTrendDate(point.date)}: ${point.count} pembelian`)
    .join(", ");
}

function ConversionTrend({ trend }: { trend: AffiliatorConversionTrendPoint[] }) {
  const maxCount = Math.max(...trend.map((point) => point.count), 1);

  return (
    <section
      aria-labelledby="affiliator-conversion-trend-heading"
      className="min-w-0 border-y border-primary-100 py-5"
      data-testid="affiliator-conversion-trend"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3
          className="font-heading text-lg font-semibold tracking-[-0.02em] text-secondary-900"
          id="affiliator-conversion-trend-heading"
        >
          Tren harian
        </h3>
        <span className="text-xs text-secondary-500">7 hari</span>
      </div>

      {trend.length ? (
        <figure className="mt-6">
          <div
            aria-label={`Konversi harian: ${trendDescription(trend)}`}
            className="grid min-h-44 grid-cols-7 items-end gap-2 border-b border-primary-200 px-1 pb-0 pt-3 sm:gap-3"
            role="img"
          >
            {trend.map((point) => {
              const height = point.count
                ? Math.max((point.count / maxCount) * 100, 12)
                : 3;

              return (
                <div
                  className="flex h-full min-w-0 flex-col items-center justify-end gap-2"
                  key={point.date}
                >
                  <span className="text-xs font-semibold tabular-nums text-secondary-700">
                    {numberFormatter.format(point.count)}
                  </span>
                  <div className="flex h-28 w-full items-end justify-center sm:h-32">
                    <div
                      aria-hidden="true"
                      className="w-full max-w-8 rounded-t-md bg-primary-700"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <figcaption className="mt-3 grid grid-cols-7 gap-2 px-1 text-center text-xs text-secondary-500 sm:gap-3">
            {trend.map((point) => (
              <span key={point.date}>{formatTrendDate(point.date)}</span>
            ))}
          </figcaption>
        </figure>
      ) : (
        <p className="mt-5 text-sm text-secondary-500">Belum ada konversi.</p>
      )}
    </section>
  );
}

function PackageMix({ packageMix }: { packageMix: AffiliatorPackageMixItem[] }) {
  const maxCount = Math.max(...packageMix.map((item) => item.count), 1);

  return (
    <section
      aria-labelledby="affiliator-package-mix-heading"
      className="min-w-0 border-y border-primary-100 py-5"
      data-testid="affiliator-package-mix"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3
          className="font-heading text-lg font-semibold tracking-[-0.02em] text-secondary-900"
          id="affiliator-package-mix-heading"
        >
          Paket
        </h3>
        <span className="text-xs text-secondary-500">Terjual</span>
      </div>

      {packageMix.length ? (
        <ol aria-label="Komposisi paket" className="mt-6 space-y-5">
          {packageMix.map((item) => {
            const width = Math.max((item.count / maxCount) * 100, 4);

            return (
              <li className="min-w-0" key={item.packageCode}>
                <div className="flex items-start justify-between gap-4 text-sm">
                  <span className="min-w-0 truncate font-medium text-secondary-800">
                    {item.packageName}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-secondary-900">
                    {numberFormatter.format(item.count)}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-2 h-2 overflow-hidden rounded-full bg-primary-100"
                >
                  <div
                    className="h-full rounded-full bg-primary-700"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-5 text-sm text-secondary-500">Belum ada penjualan.</p>
      )}
    </section>
  );
}

function AffiliatorDashboardCharts({
  conversionTrend,
  packageMix,
}: {
  conversionTrend: AffiliatorConversionTrendPoint[];
  packageMix: AffiliatorPackageMixItem[];
}) {
  return (
    <div
      aria-label="Visualisasi statistik affiliator"
      className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)] lg:gap-10"
    >
      <ConversionTrend trend={conversionTrend} />
      <PackageMix packageMix={packageMix} />
    </div>
  );
}

export { AffiliatorDashboardCharts };
