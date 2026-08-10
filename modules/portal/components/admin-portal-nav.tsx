"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BookOpenCheck,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Users,
  X,
} from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type AdminSection = "overview" | "students" | "kapten" | "imports" | "media";

const adminLinks: Array<{
  href: string;
  icon: typeof LayoutDashboard;
  id: AdminSection;
  label: string;
  detail: string;
}> = [
  {
    detail: "Live operations and attention queue",
    href: "/admin",
    icon: LayoutDashboard,
    id: "overview",
    label: "Overview",
  },
  {
    detail: "Search and manage student accounts",
    href: "/admin/enrollment",
    icon: Users,
    id: "students",
    label: "Students",
  },
  {
    detail: "Provision and manage Kapten",
    href: "/admin/kapten",
    icon: BookOpenCheck,
    id: "kapten",
    label: "Kapten",
  },
  {
    detail: "Review roster imports",
    href: "/admin/imports",
    icon: ClipboardList,
    id: "imports",
    label: "Imports",
  },
  {
    detail: "Operational media library",
    href: "/admin/media",
    icon: ClipboardList,
    id: "media",
    label: "Media",
  },
];

function AdminLink({
  activeSection,
  className,
  onNavigate,
  section,
}: {
  activeSection: AdminSection;
  className?: string;
  onNavigate?: () => void;
  section: (typeof adminLinks)[number];
}) {
  const Icon = section.icon;
  const isActive = activeSection === section.id;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex min-h-12 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-[background-color,color,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]",
        isActive
          ? "bg-[#e6f3e9] text-[#014c38] shadow-[0_12px_30px_-24px_rgba(1,76,56,0.7)]"
          : "text-[#5f776a] hover:-translate-y-px hover:bg-[#f2f8f3] hover:text-[#014c38]",
        className,
      )}
      href={section.href}
      onClick={onNavigate}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
          isActive ? "bg-[#014c38] text-white" : "bg-[#eef8f1] text-[#176b4d]",
        )}
      >
        <Icon size={17} strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5">{section.label}</span>
        <span className="mt-0.5 hidden truncate text-xs leading-4 text-current/65 lg:block">
          {section.detail}
        </span>
      </span>
    </Link>
  );
}

function AdminPortalNav({
  activeSection,
  mobileOnly = false,
}: {
  activeSection: AdminSection;
  mobileOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!mobileOnly ? (
        <aside className="hidden w-[224px] shrink-0 md:block">
        <div className="sticky top-6 rounded-[24px] border border-[#d6e5db] bg-white p-3 shadow-[0_20px_50px_-40px_rgba(1,76,56,0.5)]">
          <p className="px-3 pb-3 pt-2 text-xs font-bold uppercase tracking-[0.16em] text-[#5f776a]">
            Admin workspace
          </p>
          <nav aria-label="Admin workspace" className="space-y-1">
            {adminLinks.map((section) => (
              <AdminLink activeSection={activeSection} key={section.id} section={section} />
            ))}
          </nav>
          <div className="mt-4 rounded-2xl bg-[#014c38] px-3.5 py-3 text-white">
            <p className="text-xs font-semibold">Operate with confidence</p>
            <p className="mt-1 text-xs leading-4 text-[#c6e7cf]">
              Counts and attention items come from the current PostgreSQL snapshot.
            </p>
          </div>
        </div>
        </aside>
      ) : null}

      <div className={mobileOnly ? "" : "hidden"}>
        <button
          aria-controls="admin-mobile-navigation-sheet"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Open admin navigation"
          className="grid size-11 place-items-center rounded-xl border border-[#c9dfd0] bg-white text-[#014c38] shadow-sm transition hover:bg-[#eef8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]"
          onClick={() => setOpen(true)}
          type="button"
        >
          <Menu size={19} />
        </button>
        <Sheet onOpenChange={setOpen} open={open}>
          <SheetContent className="w-[min(88vw,360px)] border-[#d6e5db] bg-[#f7faf8] p-0" id="admin-mobile-navigation-sheet" showCloseButton={false} side="left">
            <SheetHeader className="border-b border-[#d6e5db] bg-white px-5 py-5">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div>
                  <SheetTitle className="text-[#014c38]">Admin workspace</SheetTitle>
                  <SheetDescription className="mt-1 text-[#5f776a]">
                    Choose an operation or directory.
                  </SheetDescription>
                </div>
                <button
                  aria-label="Close admin navigation"
                  className="grid size-11 place-items-center rounded-xl text-[#5f776a] hover:bg-[#eef8f1] hover:text-[#014c38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
            </SheetHeader>
            <nav aria-label="Admin workspace" className="space-y-1 p-4">
              {adminLinks.map((section) => (
                <AdminLink
                  activeSection={activeSection}
                  key={section.id}
                  onNavigate={() => setOpen(false)}
                  section={section}
                />
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

export { AdminPortalNav };
export type { AdminSection };
