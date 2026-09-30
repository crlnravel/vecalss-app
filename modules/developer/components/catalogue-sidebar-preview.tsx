"use client";

import { useState } from "react";

import { ReferenceSelect, type ReferenceSelectOption } from "@/components/dashboard/reference-dashboard-controls";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { BookOpen, LayoutGrid } from "@/lib/icons";
import { cn } from "@/lib/utils";

const SIDES = [
  { label: "Kiri", value: "left" },
  { label: "Kanan", value: "right" },
] as const satisfies readonly ReferenceSelectOption[];

const VARIANTS = [
  { label: "Sidebar", value: "sidebar" },
  { label: "Floating", value: "floating" },
  { label: "Inset", value: "inset" },
] as const satisfies readonly ReferenceSelectOption[];

const COLLAPSIBLE_MODES = [
  { label: "Offcanvas", value: "offcanvas" },
  { label: "Ikon", value: "icon" },
  { label: "Tidak ciut", value: "none" },
] as const satisfies readonly ReferenceSelectOption[];

type SidebarSide = (typeof SIDES)[number]["value"];
type SidebarVariant = (typeof VARIANTS)[number]["value"];
type SidebarCollapsible = (typeof COLLAPSIBLE_MODES)[number]["value"];

export function SidebarVariantPreview() {
  const [side, setSide] = useState<SidebarSide>("left");
  const [variant, setVariant] = useState<SidebarVariant>("floating");
  const [collapsible, setCollapsible] = useState<SidebarCollapsible>("icon");
  const [activeMenu, setActiveMenu] = useState("default-default");
  const isStatic = collapsible === "none";

  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold text-voyage-ink">Pratinjau Sidebar</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-voyage-muted-ink">
          Ubah posisi, tampilan, dan perilaku ciut sidebar. Semua pilihan hanya mengubah contoh di halaman ini.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 rounded-3xl border border-voyage-soft-border bg-white p-4 md:grid-cols-3">
        <label className="grid min-w-0 gap-2 text-xs font-semibold text-secondary-700" htmlFor="sidebar-preview-side">
          Posisi
          <ReferenceSelect
            classNames={{ trigger: "min-h-[44px]" }}
            id="sidebar-preview-side"
            onValueChange={(value) => setSide(value as SidebarSide)}
            options={SIDES}
            value={side}
          />
        </label>
        <label className="grid min-w-0 gap-2 text-xs font-semibold text-secondary-700" htmlFor="sidebar-preview-variant">
          Tampilan
          <ReferenceSelect
            classNames={{ trigger: "min-h-[44px]" }}
            id="sidebar-preview-variant"
            onValueChange={(value) => setVariant(value as SidebarVariant)}
            options={VARIANTS}
            value={variant}
          />
        </label>
        <label className="grid min-w-0 gap-2 text-xs font-semibold text-secondary-700" htmlFor="sidebar-preview-collapsible">
          Perilaku ciut
          <ReferenceSelect
            classNames={{ trigger: "min-h-[44px]" }}
            id="sidebar-preview-collapsible"
            onValueChange={(value) => setCollapsible(value as SidebarCollapsible)}
            options={COLLAPSIBLE_MODES}
            value={collapsible}
          />
        </label>
      </div>

      <SidebarProvider
        className={cn(
          "relative !min-h-0 h-[min(640px,72svh)] min-w-0 overflow-hidden rounded-3xl border border-voyage-soft-border bg-voyage-canvas shadow-sm",
          side === "right" ? "flex-row-reverse" : "flex-row",
        )}
      >
        <Sidebar
          className={collapsible === "none" ? "relative h-full" : "absolute h-full"}
          collapsible={collapsible}
          side={side}
          variant={variant}
        >
          <SidebarHeader className="gap-3 p-4">
            <div className="flex min-h-10 items-center gap-2 px-2 font-heading text-sm font-semibold text-sidebar-foreground">
              <LayoutGrid aria-hidden="true" className="size-5 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">Vecalss · Contoh</span>
            </div>
            <SidebarInput aria-label="Cari menu contoh" className="min-h-[44px]" placeholder="Cari menu…" />
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Ruang belajar</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {(["default", "outline"] as const).flatMap((buttonVariant) =>
                    (["default", "sm", "lg"] as const).map((size) => {
                      const id = `${buttonVariant}-${size}`;
                      const isActive = activeMenu === id;

                      return (
                        <SidebarMenuItem key={id}>
                          <SidebarMenuButton
                            aria-pressed={isActive}
                            isActive={isActive}
                            onClick={() => setActiveMenu(id)}
                            size={size}
                            type="button"
                            variant={buttonVariant}
                          >
                            <LayoutGrid aria-hidden="true" />
                            <span>{buttonVariant} · {size}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    }),
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton type="button" variant="default">
                      <BookOpen aria-hidden="true" />
                      <span>Contoh submenu</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      {(["sm", "md"] as const).map((size) => (
                        <SidebarMenuSubItem key={size}>
                          <SidebarMenuSubButton
                            aria-label={`Contoh submenu ukuran ${size}`}
                            href="#sidebar-menu-variants"
                            size={size}
                          >
                            <span>Submenu · {size}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarSeparator />
          <SidebarFooter className="p-3">
            <SidebarTrigger aria-label="Ciutkan atau buka sidebar contoh" className="min-h-[44px] w-full rounded-xl" disabled={isStatic} />
            <p className="px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
              {isStatic ? "Mode ini selalu terbuka dan tidak dapat diciutkan." : "Tombol ini mengubah mode ciut pada pratinjau."}
            </p>
          </SidebarFooter>
          {!isStatic && <SidebarRail aria-label="Ciutkan atau buka sidebar contoh" className="w-[44px]" />}
        </Sidebar>

        <SidebarInset className="min-h-0 min-w-0 overflow-auto bg-voyage-canvas">
          <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b border-voyage-soft-border bg-white/95 px-4 backdrop-blur">
            <SidebarTrigger aria-label="Buka atau tutup menu contoh" className="min-h-[44px] min-w-[44px] rounded-xl" disabled={isStatic} />
            <p className="min-w-0 truncate text-sm font-semibold text-secondary-900">Area konten utama</p>
          </header>
          <div className="space-y-4 p-4 sm:p-6">
            <div className="rounded-2xl border border-voyage-soft-border bg-white p-4" id="sidebar-menu-variants">
              <p className="text-sm font-semibold text-secondary-900">SidebarInset</p>
              <p className="mt-1 text-sm leading-6 text-secondary-600">
                Konten utama mengikuti posisi sidebar yang dipilih. Coba menu, tombol ciut, dan tiga kontrol di atas.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-voyage-soft-border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500">Posisi</p>
                <p className="mt-1 text-sm font-medium text-secondary-900">{side === "left" ? "Kiri" : "Kanan"}</p>
              </div>
              <div className="rounded-2xl border border-voyage-soft-border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500">Tampilan</p>
                <p className="mt-1 text-sm font-medium text-secondary-900">{variant}</p>
              </div>
              <div className="rounded-2xl border border-voyage-soft-border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500">Ciutkan</p>
                <p className="mt-1 text-sm font-medium text-secondary-900">{COLLAPSIBLE_MODES.find((item) => item.value === collapsible)?.label}</p>
              </div>
              <div className="rounded-2xl border border-voyage-soft-border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500">SidebarMenuButton</p>
                <p className="mt-1 text-sm font-medium text-secondary-900">{activeMenu.replaceAll("-", " · ")}</p>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
