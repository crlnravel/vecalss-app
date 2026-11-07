"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";

function ConditionalSpeedInsights() {
  const pathname = usePathname();

  // Invite and email verification URLs carry a bearer token and must not be
  // sent to third-party analytics or navigation instrumentation.
  if (pathname?.startsWith("/invite/") || pathname?.startsWith("/daftar/verifikasi/")) {
    return null;
  }

  return <SpeedInsights />;
}

export { ConditionalSpeedInsights };
