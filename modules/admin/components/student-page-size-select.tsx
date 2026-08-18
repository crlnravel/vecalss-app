"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DEFAULT_DIRECTORY_PAGE_SIZE,
  DIRECTORY_PAGE_SIZE_OPTIONS,
  type DirectoryPageSize,
} from "@/lib/admin/operations/directory-page-constants";
import { ChevronDown } from "@/lib/icons";

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
    <div className="inline-flex items-center gap-2 text-xs text-secondary-600">
      <span>Rows per page</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Rows per page"
          render={<Button className="h-8 min-w-16 justify-between rounded-lg border-primary-100 bg-white px-2 text-xs font-semibold text-secondary-800 hover:border-primary-300 hover:bg-primary-50/40" variant="context" />}
        >
          <span>{pageSize}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 text-secondary-500" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-(--anchor-width)">
          <DropdownMenuRadioGroup onValueChange={handleChange} value={String(pageSize)}>
            {DIRECTORY_PAGE_SIZE_OPTIONS.map((option) => (
              <DropdownMenuRadioItem closeOnClick key={option} value={String(option)}>
                {option}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { StudentPageSizeSelect };
