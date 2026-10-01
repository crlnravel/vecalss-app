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
  basePath = "/admin/enrollment",
  pageSize,
  query,
}: {
  basePath?: string;
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
    router.replace(queryString ? `${basePath}?${queryString}` : basePath, { scroll: false });
  };

  return (
    <div className="inline-flex items-center gap-2 text-xs text-secondary-600">
      <span>Baris per halaman</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Baris per halaman"
          render={<Button className="min-w-16 justify-between" size="sm" variant="outline" />}
        >
          <span>{pageSize}</span>
          <ChevronDown aria-hidden="true" className="size-3.5" />
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
