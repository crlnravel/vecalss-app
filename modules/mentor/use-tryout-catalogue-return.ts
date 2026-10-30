"use client";

import { useSearchParams } from "next/navigation";
import { withTryoutCatalogueReturn } from "@/lib/navigation/mentor-tryout-continuity";

export function useTryoutCatalogueReturn() {
  const query = useSearchParams();
  return (href: string) => withTryoutCatalogueReturn(href, query.get("returnTo"));
}
