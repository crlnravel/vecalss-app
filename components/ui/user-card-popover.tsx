"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export function UserCardPopover({
  name,
  subject,
  avatarSrc,
  initials,
}: {
  name: string;
  subject?: string | null;
  avatarSrc?: string | null;
  initials?: string;
}) {
  const fallback =
    initials ??
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("id");
  const portrait = (size: "default" | "lg") => (
    <Avatar size={size} aria-hidden="true">
      {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  );

  return (
    <Popover>
      <PopoverTrigger
        render={<Button type="button" variant="quiet" size="icon" />}
        aria-label={`Lihat profil ${name}`}
      >
        {portrait("default")}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)]">
        <div className="flex min-w-0 items-center gap-3">
          {portrait("lg")}
          <div className="min-w-0 max-w-[224px] space-y-1">
            <PopoverTitle className="text-[14px] font-semibold wrap-break-word">
              {name}
            </PopoverTitle>
            {subject && (
              <PopoverDescription className="text-[12px] leading-[18px] wrap-break-word">
                {subject}
              </PopoverDescription>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
