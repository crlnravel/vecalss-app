"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { ReferenceSurface } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "@/lib/icons";
import type {
  AffiliatorConversionBreakdownPoint,
  AffiliatorConversionTrendPoint,
  AffiliatorPackageMixItem,
} from "@/lib/affiliator/service";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

const numberFormatter = new Intl.NumberFormat("id-ID");

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const purchaseChartConfig = {
  count: {
    label: "Pembelian",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type DistributionGroup = "package" | "day";

type BarDatum = {
  count: number;
  date: string;
  label: string;
};

type PieDatum = {
  count: number;
  fill: string;
  key: string;
  label: string;
};

function formatTrendDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00+07:00`));
}

function sumByDate(
  breakdown: AffiliatorConversionBreakdownPoint[],
  packageCode: string,
) {
  const counts = new Map<string, number>();

  for (const point of breakdown) {
    if (packageCode !== "all" && point.packageCode !== packageCode) continue;
    counts.set(point.date, (counts.get(point.date) ?? 0) + point.count);
  }

  return counts;
}

function ChartFilterMenu({
  label,
  onValueChange,
  options,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        render={
          <Button
            className="h-auto min-h-10 max-w-full gap-1.5 rounded-xl px-3 text-xs font-semibold"
            size="sm"
            type="button"
            variant="reference"
          />
        }
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-secondary-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuRadioGroup onValueChange={onValueChange} value={value}>
          {options.map((option) => (
            <DropdownMenuRadioItem closeOnClick key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConversionTrend({
  breakdown,
  packageCode,
  trend,
}: {
  breakdown: AffiliatorConversionBreakdownPoint[];
  packageCode: string;
  trend: AffiliatorConversionTrendPoint[];
}) {
  const countsByDate = useMemo(() => sumByDate(breakdown, packageCode), [breakdown, packageCode]);
  const data = useMemo<BarDatum[]>(
    () =>
      trend.map((point) => ({
        count: packageCode === "all" ? point.count : countsByDate.get(point.date) ?? 0,
        date: point.date,
        label: formatTrendDate(point.date),
      })),
    [countsByDate, packageCode, trend],
  );

  return (
    <ReferenceSurface
      aria-labelledby="affiliator-conversion-trend-heading"
      as="section"
      className="min-w-0 p-5 sm:p-6"
      data-testid="affiliator-conversion-trend"
      variant="inset"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3
            className="font-heading text-lg font-semibold tracking-[-0.02em] text-secondary-900"
            id="affiliator-conversion-trend-heading"
          >
            Pembelian per hari
          </h3>
          <p className="mt-1 text-xs text-secondary-500">7 hari aktif terakhir</p>
        </div>
        <span className="text-xs font-medium tabular-nums text-secondary-500">
          {numberFormatter.format(data.reduce((total, point) => total + point.count, 0))} total
        </span>
      </div>

      {data.length ? (
        <ChartContainer
          aria-label="Diagram batang pembelian per hari"
          className="mt-5 h-[230px] w-full max-w-full aspect-auto"
          config={purchaseChartConfig}
        >
          <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="label"
              tickLine={false}
              tickMargin={8}
              tick={{ fontSize: 11 }}
            />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={34} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) =>
                    payload[0]?.payload?.date
                      ? formatTrendDate(String(payload[0].payload.date))
                      : "Pembelian"
                  }
                />
              }
              cursor={false}
            />
            <Bar dataKey="count" fill="var(--color-count)" maxBarSize={38} radius={6} />
          </BarChart>
        </ChartContainer>
      ) : (
        <p className="mt-5 text-sm text-secondary-500">Belum ada pembelian.</p>
      )}
    </ReferenceSurface>
  );
}

function PackageDistribution({
  breakdown,
  groupBy,
  packageCode,
  packageMix,
  trend,
}: {
  breakdown: AffiliatorConversionBreakdownPoint[];
  groupBy: DistributionGroup;
  packageCode: string;
  packageMix: AffiliatorPackageMixItem[];
  trend: AffiliatorConversionTrendPoint[];
}) {
  const data = useMemo<PieDatum[]>(() => {
    const grouped = new Map<string, PieDatum>();

    if (groupBy === "package") {
      for (const item of packageMix) {
        if (packageCode !== "all" && item.packageCode !== packageCode) continue;
        grouped.set(item.packageCode, {
          count: item.count,
          fill: PIE_COLORS[grouped.size % PIE_COLORS.length],
          key: item.packageCode,
          label: item.packageName,
        });
      }
    } else if (packageCode === "all") {
      for (const item of trend) {
        grouped.set(item.date, {
          count: item.count,
          fill: PIE_COLORS[grouped.size % PIE_COLORS.length],
          key: item.date,
          label: formatTrendDate(item.date),
        });
      }
    } else {
      for (const item of breakdown) {
        if (item.packageCode !== packageCode) continue;
        const current = grouped.get(item.date);
        grouped.set(item.date, {
          count: (current?.count ?? 0) + item.count,
          fill: current?.fill ?? PIE_COLORS[grouped.size % PIE_COLORS.length],
          key: item.date,
          label: formatTrendDate(item.date),
        });
      }
    }

    return [...grouped.values()].sort((left, right) => right.count - left.count);
  }, [breakdown, groupBy, packageCode, packageMix, trend]);

  const distributionChartConfig = useMemo<ChartConfig>(
    () => ({
      count: { label: "Pembelian", color: "var(--chart-1)" },
      ...Object.fromEntries(
        data.map((item) => [item.key, { label: item.label, color: item.fill }]),
      ),
    }),
    [data],
  );
  const totalCount = data.reduce((total, item) => total + item.count, 0);
  const distributionSummary = data
    .map((item) => {
      const percentage = totalCount ? Math.round((item.count / totalCount) * 100) : 0;
      return `${item.label}: ${numberFormatter.format(item.count)} (${percentage}%)`;
    })
    .join(", ");

  return (
    <ReferenceSurface
      aria-labelledby="affiliator-package-mix-heading"
      as="section"
      className="min-w-0 p-5 sm:p-6"
      data-testid="affiliator-package-mix"
      variant="inset"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3
            className="font-heading text-lg font-semibold tracking-[-0.02em] text-secondary-900"
            id="affiliator-package-mix-heading"
          >
            Distribusi pembelian
          </h3>
          <p className="mt-1 text-xs text-secondary-500">
            {groupBy === "package" ? "Menurut paket" : "Menurut hari"}
          </p>
        </div>
        <span className="text-xs font-medium tabular-nums text-secondary-500">
          {numberFormatter.format(totalCount)} total
        </span>
      </div>

      {data.length ? (
        <ChartContainer
          aria-label={
            `${groupBy === "package" ? "Diagram lingkaran distribusi paket" : "Diagram lingkaran distribusi hari"}: ${distributionSummary}`
          }
          className="mx-auto mt-4 h-[260px] w-full max-w-[360px] aspect-auto"
          config={distributionChartConfig}
        >
          <PieChart accessibilityLayer>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
            <Pie
              data={data}
              dataKey="count"
              innerRadius={58}
              nameKey="key"
              outerRadius={88}
              paddingAngle={2}
              strokeWidth={2}
            >
              {data.map((item) => (
                <Cell fill={item.fill} key={item.key} />
              ))}
            </Pie>
            <ChartLegend
              content={
                <ChartLegendContent
                  className="flex-wrap gap-x-3 gap-y-1.5"
                  nameKey="key"
                />
              }
            />
          </PieChart>
        </ChartContainer>
      ) : (
        <p className="mt-5 text-sm text-secondary-500">Belum ada pembelian.</p>
      )}

      {data.length ? (
        <ul
          aria-label="Ringkasan distribusi pembelian"
          className="mt-2 grid gap-2 sm:grid-cols-2"
        >
          {data.map((item) => {
            const percentage = totalCount ? Math.round((item.count / totalCount) * 100) : 0;

            return (
              <li
                className="flex min-w-0 items-center justify-between gap-3 text-xs"
                key={`summary-${item.key}`}
              >
                <span className="flex min-w-0 items-center gap-2 text-secondary-600">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="truncate" title={item.label}>
                    {item.label}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-secondary-900">
                  {numberFormatter.format(item.count)} · {percentage}%
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </ReferenceSurface>
  );
}

function AffiliatorDashboardCharts({
  conversionBreakdown,
  conversionTrend,
  packageMix,
}: {
  conversionBreakdown: AffiliatorConversionBreakdownPoint[];
  conversionTrend: AffiliatorConversionTrendPoint[];
  packageMix: AffiliatorPackageMixItem[];
}) {
  const [packageCode, setPackageCode] = useState("all");
  const [groupBy, setGroupBy] = useState<DistributionGroup>("package");

  const packageOptions = useMemo(
    () => [
      { label: "Semua paket", value: "all" },
      ...packageMix.map((item) => ({ label: item.packageName, value: item.packageCode })),
    ],
    [packageMix],
  );

  return (
    <section aria-label="Visualisasi statistik affiliator" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-[-0.025em] text-secondary-900">Analisis</h2>
          <p className="mt-1 text-sm text-secondary-500">Saring paket atau ubah kelompok distribusi.</p>
        </div>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
          <ChartFilterMenu
            label="Filter paket"
            onValueChange={setPackageCode}
            options={packageOptions}
            value={packageCode}
          />
          <ChartFilterMenu
            label="Kelompokkan distribusi"
            onValueChange={(value) => setGroupBy(value as DistributionGroup)}
            options={[
              { label: "Kelompok: paket", value: "package" },
              { label: "Kelompok: hari", value: "day" },
            ]}
            value={groupBy}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)] lg:gap-5">
        <ConversionTrend breakdown={conversionBreakdown} packageCode={packageCode} trend={conversionTrend} />
        <PackageDistribution
          breakdown={conversionBreakdown}
          groupBy={groupBy}
          packageCode={packageCode}
          packageMix={packageMix}
          trend={conversionTrend}
        />
      </div>
    </section>
  );
}

export { AffiliatorDashboardCharts };
