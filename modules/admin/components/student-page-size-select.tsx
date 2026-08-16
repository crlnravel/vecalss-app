"use client";

import { useRouter } from "next/navigation";

import {
  DEFAULT_DIRECTORY_PAGE_SIZE,
  DIRECTORY_PAGE_SIZE_OPTIONS,
  type DirectoryPageSize,
} from "@/lib/admin/operations/directory-page-constants";

function StudentPageSizeSelect({
  pageSize,
  query,
}: {
  pageSize: DirectoryPageSize;
  query: string;
}) {
  const router = useRouter();

  const handleChange = (value: string) => {
    const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    params.delete("focus");
    params.delete("page");

    if (Number(value) === DEFAULT_DIRECTORY_PAGE_SIZE) {
      params.delete("pageSize");
    } else {
      params.set("pageSize", value);
    }

    const queryString = params.toString();
    router.replace(queryString ? `/admin/enrollment?${queryString}` : "/admin/enrollment", { scroll: false });
  };

  return (
    <label className="inline-flex items-center gap-2 text-xs text-secondary-600">
      <span>Rows per page</span>
      <select
        aria-label="Rows per page"
        className="h-8 cursor-pointer rounded-lg border border-primary-100 bg-white px-2 text-xs font-semibold text-secondary-800 outline-none transition-colors hover:border-primary-300 focus-visible:border-primary-500 focus-visible:ring-3 focus-visible:ring-primary-500/20"
        onChange={(event) => handleChange(event.currentTarget.value)}
        value={pageSize}
      >
        {DIRECTORY_PAGE_SIZE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export { StudentPageSizeSelect };
