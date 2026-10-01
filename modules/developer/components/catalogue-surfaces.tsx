"use client";

import type { CatalogueSurfaceSection } from "./catalogue-surfaces-types";
import {
  AccordionPreview,
  DialogsPreview,
  MenusPreview,
  PopoversTooltipsPreview,
  SheetsPreview,
} from "./catalogue-surfaces-overlays";
import {
  AttachmentsPreview,
  BubblesPreview,
  CardsPreview,
  EmptyStatesPreview,
  ProgressSkeletonPreview,
  SeparatorPreview,
} from "./catalogue-surfaces-content";
import {
  BreadcrumbsPaginationPreview,
  CalendarScrollAreaPreview,
  ChartsPreview,
  DataTablesPreview,
  SidebarPreview,
} from "./catalogue-surfaces-navigation";
import { NotificationsPreview } from "./catalogue-surfaces-notifications";

export const surfaceSections: CatalogueSurfaceSection[] = [
  {
    id: "accordion",
    title: "AccordionList",
    description: "Varian default dan minimal; bandingkan satu atau beberapa bagian terbuka. Teks tetap 14px dan setiap pemicu setinggi minimal 44px di semua ukuran layar.",
    sources: ["components/ui/accordion.tsx", "lib/icons.tsx"],
    preview: <AccordionPreview />,
  },
  {
    id: "dialogs",
    title: "Dialog & AlertDialog",
    description: "Lima tone modal, tiga lebar komposisi, dua ukuran AlertDialog, serta semua tone media konfirmasi.",
    sources: ["components/ui/dialog.tsx", "components/ui/alert-dialog.tsx", "components/ui/modal-variants.ts", "components/ui/button.tsx", "components/ui/button-variants.ts", "lib/icons.tsx"],
    preview: <DialogsPreview />,
  },
  {
    id: "sheets",
    title: "Sheet",
    description: "Buka panel dari sisi atas, kanan, bawah, atau kiri; setiap contoh dapat ditutup dengan kontrolnya sendiri.",
    sources: ["components/ui/sheet.tsx", "components/ui/button.tsx", "components/ui/button-variants.ts", "lib/icons.tsx"],
    preview: <SheetsPreview />,
  },
  {
    id: "popovers-tooltips",
    title: "Popover & Tooltip",
    description: "Popover pilihan periode dan tooltip dengan posisi berbeda, memakai primitive bersama.",
    sources: ["components/ui/popover.tsx", "components/ui/tooltip.tsx", "components/ui/button.tsx", "components/ui/button-variants.ts"],
    preview: <PopoversTooltipsPreview />,
  },
  {
    id: "menus",
    title: "DropdownMenu & ContextMenu",
    description: "Item biasa/destructive, checkbox, radio, submenu, shortcut, dan menu klik-kanan yang hanya mengubah state contoh.",
    sources: ["components/ui/dropdown-menu.tsx", "components/ui/context-menu.tsx", "components/ui/button.tsx", "components/ui/button-variants.ts", "lib/icons.tsx"],
    preview: <MenusPreview />,
  },
  {
    id: "cards",
    title: "Card & StudentCatalogueCard",
    description: "Ukuran Card default/ringkas dan variasi StudentCatalogueCard materi, kuis, serta tryout.",
    sources: ["components/ui/card.tsx", "components/ui/student-catalogue-card.tsx", "components/ui/student-catalogue-card-variants.ts", "components/ui/button.tsx", "lib/icons.tsx", "public/landing-assets/hero-voyage-higgsfield.png"],
    preview: <CardsPreview />,
  },
  {
    id: "empty-states",
    title: "Empty & TypedRouteState",
    description: "EmptyMedia default/icon serta sepuluh keadaan rute yang dapat dijelajahi satu per satu.",
    sources: ["components/ui/empty.tsx", "components/ui/typed-route-state.tsx", "components/ui/button.tsx", "components/ui/button-variants.ts", "lib/icons.tsx"],
    preview: <EmptyStatesPreview />,
  },
  {
    id: "progress-skeleton",
    title: "Progress & Skeleton",
    description: "Ubah nilai Progress secara lokal dan bandingkan Skeleton dengan isi yang sudah siap.",
    sources: ["components/ui/progress.tsx", "components/ui/skeleton.tsx", "components/ui/button.tsx", "components/ui/button-variants.ts"],
    preview: <ProgressSkeletonPreview />,
  },
  {
    id: "separators",
    title: "Separator",
    description: "Garis pemisah horizontal dan vertical di antara kelompok informasi.",
    sources: ["components/ui/separator.tsx"],
    preview: <SeparatorPreview />,
  },
  {
    id: "attachments-bubbles",
    title: "Attachment & Bubble",
    description: "Lampiran dalam tiga ukuran, dua orientasi, lima status, media ikon/gambar, tujuh tone bubble, dan empat posisi reaksi.",
    sources: ["components/ui/attachment.tsx", "components/ui/bubble.tsx", "components/ui/button.tsx", "components/ui/button-variants.ts", "lib/icons.tsx", "public/landing-assets/program-consultation.svg"],
    preview: <><AttachmentsPreview /><div className="my-7 border-t border-voyage-soft-border" /><BubblesPreview /></>,
  },
  {
    id: "breadcrumbs-pagination",
    title: "Breadcrumb, BackButton & Pagination",
    description: "Jejak lokasi, tombol kembali ke tujuan langsung, serta pagination dengan state halaman lokal.",
    sources: ["components/ui/breadcrumb.tsx", "components/ui/back-button.tsx", "components/ui/pagination.tsx", "components/ui/button.tsx", "components/ui/button-variants.ts", "lib/icons.tsx"],
    preview: <BreadcrumbsPaginationPreview />,
  },
  {
    id: "data-tables",
    title: "Table, DataTable & DataTableFilterMenu",
    description: "Tabel semantik dan DataTable dengan pencarian, filter status, filter chip, responsif, serta keadaan tanpa hasil.",
    sources: ["components/ui/table.tsx", "components/ui/data-table.tsx", "components/ui/data-table-utils.ts", "components/ui/data-table-filter-menu.tsx", "components/ui/field-constants.ts", "components/ui/checkbox.tsx", "components/ui/popover.tsx", "components/ui/dropdown-menu.tsx", "components/ui/context-menu.tsx", "components/ui/button.tsx", "components/ui/button-variants.ts", "lib/icons.tsx"],
    preview: <DataTablesPreview />,
  },
  {
    id: "calendar-scroll-area",
    title: "Calendar & ScrollArea",
    description: "Pilih tanggal lalu coba area gulir vertikal dan horizontal dengan daftar contoh.",
    sources: ["components/ui/calendar.tsx", "components/ui/scroll-area.tsx", "lib/icons.tsx"],
    preview: <CalendarScrollAreaPreview />,
  },
  {
    id: "charts",
    title: "Chart",
    description: "Diagram batang Recharts dengan tooltip dan legenda dari primitive chart bersama; angka hanya data contoh.",
    sources: ["components/ui/chart.tsx", "modules/affiliator/components/affiliator-dashboard-chart-content.tsx"],
    preview: <ChartsPreview />,
  },
  {
    id: "notifications",
    title: "Sonner, toast & action feedback",
    description: "Lima tone showToast, useActionToast, status halaman persisten, dan ToastOnMount yang hanya berjalan setelah dipilih.",
    sources: ["components/ui/toast.ts", "components/ui/sonner.tsx", "components/ui/sonner-layout.module.css", "components/ui/use-action-toast.ts", "components/ui/use-page-status-toast.ts", "components/ui/page-status-toast-controller.ts", "components/ui/toast-on-mount.tsx", "components/ui/button.tsx", "components/ui/button-variants.ts", "app/layout.tsx"],
    preview: <NotificationsPreview />,
  },
  {
    id: "sidebar",
    title: "Sidebar · DeveloperWorkspaceShell",
    description: "Kendali sidebar Developer serta pratinjau terpisah untuk mencoba posisi, tampilan, perilaku ciut, dan ukuran menu Sidebar.",
    sources: ["components/ui/sidebar.tsx", "components/ui/input.tsx", "components/ui/field-constants.ts", "components/ui/separator.tsx", "components/ui/sheet.tsx", "components/ui/skeleton.tsx", "components/ui/tooltip.tsx", "components/ui/button.tsx", "components/dashboard/reference-dashboard-controls.tsx", "components/dashboard/reference-dashboard-tokens.ts", "lib/icons.tsx", "hooks/use-mobile.ts", "modules/developer/components/developer-workspace-shell.tsx", "modules/developer/components/catalogue-sidebar-preview.tsx", "modules/student/components/student-sidebar-utils.ts", "modules/home/components/home-primitives.tsx"],
    preview: <SidebarPreview />,
  },
];
