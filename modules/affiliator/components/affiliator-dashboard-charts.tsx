"use client";

import dynamic from "next/dynamic";

const AffiliatorDashboardCharts = dynamic(
  () =>
    import("./affiliator-dashboard-chart-content").then(
      (module) => module.AffiliatorDashboardCharts,
    ),
  { loading: () => null },
);

export { AffiliatorDashboardCharts };
