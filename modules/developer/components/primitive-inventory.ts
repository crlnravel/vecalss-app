export type PrimitiveCategory =
  | "controls"
  | "forms"
  | "navigation"
  | "surfaces"
  | "feedback"
  | "data"
  | "content"
  | "utilities"
  | "developer";

export type PrimitiveKind =
  | "component"
  | "variant-source"
  | "helper"
  | "barrel"
  | "token-contract";

export type PrimitiveInventoryEntry = {
  readonly source: string;
  readonly category: PrimitiveCategory;
  readonly kind: PrimitiveKind;
  readonly demoId: string;
  readonly relatedSources?: readonly string[];
  readonly supportOnlyReason?: string;
  readonly variants?: Readonly<Record<string, readonly string[]>>;
  readonly defaults?: Readonly<Record<string, string>>;
  readonly defaultNotes?: Readonly<Record<string, string>>;
};

/** Color names come from the active CSS custom properties, never from copied hex values. */
export const COLOR_TOKEN_GROUPS = [
  { id: "voyage", label: "Palet Voyage", prefixes: ["--voyage-"] },
  { id: "learning", label: "Warna pembelajaran", prefixes: ["--learning-"] },
  { id: "primary", label: "Skala primer", prefixes: ["--primary-"] },
  { id: "secondary", label: "Skala sekunder", prefixes: ["--secondary-"] },
  { id: "accent", label: "Skala aksen", prefixes: ["--accent-"] },
  { id: "danger", label: "Skala bahaya", prefixes: ["--danger-"] },
  { id: "warning", label: "Skala peringatan", prefixes: ["--warning-"] },
  { id: "student-status", label: "Status pelajar", prefixes: ["--student-status-"] },
] as const;

/** Semantic aliases declared by app/globals.css; each value is resolved from the rendered page. */
export const SEMANTIC_COLOR_TOKEN_NAMES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--muted",
  "--muted-foreground",
  "--border",
  "--input",
  "--ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  "--dashboard-sun",
  "--paper",
  "--paper-strong",
  "--navy-glow",
  "--gold-glow",
] as const;

/** CSS classes are the source for the displayed type; the page reports their computed styles. */
export const TYPOGRAPHY_PROBES = [
  { id: "ui-xs", label: "Teks antarmuka XS", className: "text-ui-xs", sample: "Label dan keterangan" },
  { id: "ui-sm", label: "Teks antarmuka SM", className: "text-ui-sm", sample: "Teks pendukung yang ringkas" },
  { id: "ui-base", label: "Teks antarmuka dasar", className: "text-ui-base", sample: "Teks utama untuk membaca informasi." },
  { id: "ui-lg", label: "Teks antarmuka besar", className: "text-ui-lg", sample: "Penekanan dalam isi halaman" },
  { id: "ui-title", label: "Judul kecil", className: "text-ui-title", sample: "Judul bagian" },
  { id: "scale-2xl", label: "Skala 2XL", className: "text-2xl", sample: "Judul panel utama" },
  { id: "scale-3xl", label: "Skala 3XL", className: "text-3xl", sample: "Judul halaman ringkas" },
  {
    id: "page-title",
    label: "Judul halaman",
    className: "reference-page-title",
    wrapperClassName: "mentor-workspace-content",
    sample: "Tryout Workspace",
  },
] as const;

/** Padding utilities expose the active spacing rhythm after the root rem scale is applied. */
export const SPACING_PROBES = [
  { id: "space-1", className: "p-1" },
  { id: "space-2", className: "p-2" },
  { id: "space-4", className: "p-4" },
  { id: "space-6", className: "p-6" },
  { id: "space-8", className: "p-8" },
  { id: "space-10", className: "p-10" },
] as const;

/** Radius utilities resolve the shared --radius family through the active Tailwind theme. */
export const RADIUS_PROBES = [
  { id: "radius-sm", className: "rounded-sm" },
  { id: "radius-md", className: "rounded-md" },
  { id: "radius-lg", className: "rounded-lg" },
  { id: "radius-xl", className: "rounded-xl" },
  { id: "radius-2xl", className: "rounded-2xl" },
  { id: "radius-3xl", className: "rounded-3xl" },
  { id: "radius-4xl", className: "rounded-4xl" },
  { id: "radius-5xl", className: "rounded-5xl" },
  { id: "radius-6xl", className: "rounded-6xl" },
  { id: "radius-full", className: "rounded-full" },
] as const;

/**
 * Inventory for the shared UI and dashboard component source files. Support rows
 * point to the component demo that exercises their implementation contract.
 */
export const primitiveInventory = [
  { source: "components/ui/accordion.tsx", category: "navigation", kind: "component", demoId: "accordion" },
  {
    source: "components/ui/alert-dialog.tsx",
    category: "feedback",
    kind: "component",
    demoId: "dialogs",
    variants: { size: ["default", "sm"], variant: ["default", "info", "warning", "danger", "success"] },
    defaults: { size: "default", variant: "default" },
  },
  {
    source: "components/ui/alert.tsx",
    category: "feedback",
    kind: "component",
    demoId: "alerts",
    variants: { variant: ["default", "destructive"] },
  },
  {
    source: "components/ui/attachment.tsx",
    category: "content",
    kind: "component",
    demoId: "attachments-bubbles",
    variants: {
      "Attachment.size": ["default", "sm", "xs"],
      "Attachment.orientation": ["horizontal", "vertical"],
      "Attachment.state": ["idle", "uploading", "processing", "error", "done"],
      "AttachmentMedia.variant": ["icon", "image"],
    },
    defaults: {
      "Attachment.size": "default",
      "Attachment.orientation": "horizontal",
      "Attachment.state": "done",
      "AttachmentMedia.variant": "icon",
    },
  },
  { source: "components/ui/avatar.tsx", category: "content", kind: "component", demoId: "avatars" },
  { source: "components/ui/back-button.tsx", category: "navigation", kind: "component", demoId: "breadcrumbs-pagination" },
  {
    source: "components/ui/badge-variants.ts",
    category: "content",
    kind: "variant-source",
    demoId: "badges",
    relatedSources: ["components/ui/badge.tsx"],
    supportOnlyReason: "Defines Badge style and size recipes; the rendered examples belong in the Badge section.",
    variants: { variant: ["accent", "mint", "neutral"], size: ["section", "card", "footer", "ui"] },
  },
  { source: "components/ui/badge.tsx", category: "content", kind: "component", demoId: "badges", relatedSources: ["components/ui/badge-variants.ts"] },
  { source: "components/ui/breadcrumb.tsx", category: "navigation", kind: "component", demoId: "breadcrumbs-pagination" },
  {
    source: "components/ui/bubble.tsx",
    category: "content",
    kind: "component",
    demoId: "attachments-bubbles",
    variants: {
      variant: ["default", "secondary", "muted", "tinted", "outline", "ghost", "destructive"],
      align: ["start", "end"],
      "BubbleReactions.side": ["top", "bottom"],
      "BubbleReactions.align": ["start", "end"],
    },
    defaults: {
      variant: "default",
      align: "start",
      "BubbleReactions.side": "bottom",
      "BubbleReactions.align": "end",
    },
  },
  {
    source: "components/ui/button-variants.ts",
    category: "controls",
    kind: "variant-source",
    demoId: "buttons",
    relatedSources: ["components/ui/button.tsx"],
    supportOnlyReason: "Defines Button recipes; variant examples are rendered by the Button demo.",
    variants: {
      variant: [
        "default", "brand", "filterActive", "marketing", "marketingOutline", "marketingOnDark",
        "onboarding", "learning", "learningComplete", "learningAttention", "brandOutline", "reference",
        "context", "contextSelected", "attentionOutline", "attention", "dangerOutline", "inverseOutline",
        "outline", "secondary", "ghost", "destructive", "link",
      ],
      size: [
        "default", "xs", "sm", "lg", "marketing", "marketingCompact", "onboarding", "learning",
        "learningAttention", "icon", "icon-xs", "icon-sm", "icon-lg",
      ],
    },
  },
  { source: "components/ui/button.tsx", category: "controls", kind: "component", demoId: "buttons", relatedSources: ["components/ui/button-variants.ts"] },
  { source: "components/ui/calendar.tsx", category: "forms", kind: "component", demoId: "calendar-scroll-area" },
  {
    source: "components/ui/card.tsx",
    category: "surfaces",
    kind: "component",
    demoId: "cards",
    variants: { size: ["default", "sm"] },
    defaults: { size: "default" },
  },
  { source: "components/ui/chart.tsx", category: "data", kind: "component", demoId: "charts" },
  { source: "components/ui/checkbox.tsx", category: "forms", kind: "component", demoId: "choice-controls" },
  { source: "components/ui/compact-filter-tabs.tsx", category: "navigation", kind: "component", demoId: "specialty-tabs" },
  { source: "components/ui/context-menu.tsx", category: "navigation", kind: "component", demoId: "menus" },
  {
    source: "components/ui/csv-template-download.tsx",
    category: "utilities",
    kind: "component",
    demoId: "file-controls",
    supportOnlyReason: "A task-specific download action; its behavior is covered with export examples rather than as a visual primitive.",
  },
  {
    source: "components/ui/data-table-filter-menu.tsx",
    category: "data",
    kind: "component",
    demoId: "data-tables",
    relatedSources: ["components/ui/data-table.tsx"],
    supportOnlyReason: "A DataTable companion control; show its filter menu inside a table example.",
  },
  {
    source: "components/ui/data-table-utils.ts",
    category: "data",
    kind: "helper",
    demoId: "data-tables",
    relatedSources: ["components/ui/data-table.tsx"],
    supportOnlyReason: "Class-name helper used by DataTable; it has no independent rendered state.",
  },
  { source: "components/ui/data-table.tsx", category: "data", kind: "component", demoId: "data-tables" },
  {
    source: "components/ui/dialog.tsx",
    category: "feedback",
    kind: "component",
    demoId: "dialogs",
    variants: { variant: ["default", "info", "warning", "danger", "success"] },
    defaults: { variant: "default" },
  },
  { source: "components/ui/dropdown-menu.tsx", category: "navigation", kind: "component", demoId: "menus" },
  {
    source: "components/ui/empty.tsx",
    category: "feedback",
    kind: "component",
    demoId: "empty-states",
    variants: { media: ["default", "icon"] },
  },
  {
    source: "components/ui/field-constants.ts",
    category: "forms",
    kind: "helper",
    demoId: "fields",
    relatedSources: ["components/ui/field.tsx"],
    supportOnlyReason: "Exports shared field classes consumed by Field and settings-style controls.",
  },
  { source: "components/ui/field.tsx", category: "forms", kind: "component", demoId: "fields", relatedSources: ["components/ui/field-constants.ts"] },
  { source: "components/ui/file-upload-slot.tsx", category: "forms", kind: "component", demoId: "file-controls" },
  { source: "components/ui/full-width-line-tabs.tsx", category: "navigation", kind: "component", demoId: "specialty-tabs" },
  { source: "components/ui/input.tsx", category: "forms", kind: "component", demoId: "fields" },
  {
    source: "components/ui/mentor-badge.tsx",
    category: "content",
    kind: "component",
    demoId: "mentor-badges",
    variants: {
      depth: ["flat", "sunken"],
      tone: ["category", "neutral", "active", "attention", "success", "info", "danger"],
      size: ["compact", "xs", "sm", "md"],
    },
    defaults: { depth: "sunken", tone: "neutral", size: "sm" },
    defaultNotes: { depth: "When omitted, MentorBadge also adds its inset shadow treatment." },
  },
  {
    source: "components/ui/modal-variants.ts",
    category: "feedback",
    kind: "variant-source",
    demoId: "dialogs",
    relatedSources: ["components/ui/dialog.tsx", "components/ui/alert-dialog.tsx"],
    supportOnlyReason: "Provides shared dialog border and media tones; render them through modal examples.",
    variants: { ModalVariant: ["default", "info", "warning", "danger", "success"] },
  },
  { source: "components/ui/mode-card-tabs.tsx", category: "navigation", kind: "component", demoId: "specialty-tabs" },
  { source: "components/ui/pagination.tsx", category: "navigation", kind: "component", demoId: "breadcrumbs-pagination" },
  { source: "components/ui/popover.tsx", category: "surfaces", kind: "component", demoId: "popovers-tooltips" },
  { source: "components/ui/progress.tsx", category: "feedback", kind: "component", demoId: "progress-skeleton" },
  { source: "components/ui/radio-group.tsx", category: "forms", kind: "component", demoId: "choice-controls" },
  { source: "components/ui/radio-pill-group.tsx", category: "forms", kind: "component", demoId: "choice-controls" },
  { source: "components/ui/scroll-area.tsx", category: "surfaces", kind: "component", demoId: "calendar-scroll-area" },
  { source: "components/ui/separator.tsx", category: "surfaces", kind: "component", demoId: "separators" },
  { source: "components/ui/sheet.tsx", category: "surfaces", kind: "component", demoId: "sheets" },
  {
    source: "components/ui/sidebar.tsx",
    category: "navigation",
    kind: "component",
    demoId: "sidebar",
    variants: {
      "Sidebar.side": ["left", "right"],
      "Sidebar.variant": ["sidebar", "floating", "inset"],
      "Sidebar.collapsible": ["offcanvas", "icon", "none"],
      "SidebarMenuButton.variant": ["default", "outline"],
      "SidebarMenuButton.size": ["default", "sm", "lg"],
      "SidebarMenuSubButton.size": ["sm", "md"],
    },
    defaults: {
      "Sidebar.side": "left",
      "Sidebar.variant": "sidebar",
      "Sidebar.collapsible": "offcanvas",
      "SidebarMenuButton.variant": "default",
      "SidebarMenuButton.size": "default",
      "SidebarMenuSubButton.size": "md",
    },
  },
  { source: "components/ui/skeleton.tsx", category: "feedback", kind: "component", demoId: "progress-skeleton" },
  { source: "components/ui/sonner.tsx", category: "feedback", kind: "component", demoId: "notifications" },
  {
    source: "components/ui/student-badge-variants.ts",
    category: "content",
    kind: "variant-source",
    demoId: "student-badges",
    relatedSources: ["components/ui/student-badge.tsx"],
    supportOnlyReason: "Defines StudentBadge size, tone, and depth recipes; examples belong in StudentBadge.",
    variants: {
      depth: ["flat", "sunken"],
      tone: ["category", "neutral", "active", "attention", "success", "info", "danger"],
      size: ["xs", "sm", "md"],
    },
    defaults: { depth: "sunken", tone: "neutral", size: "sm" },
  },
  { source: "components/ui/student-badge.tsx", category: "content", kind: "component", demoId: "student-badges", relatedSources: ["components/ui/student-badge-variants.ts"] },
  {
    source: "components/ui/student-catalogue-card-variants.ts",
    category: "content",
    kind: "variant-source",
    demoId: "cards",
    relatedSources: ["components/ui/student-catalogue-card.tsx"],
    supportOnlyReason: "Defines the three StudentCatalogueCard layouts; render them through the card demo.",
    variants: { variant: ["materi", "kuis", "tryout"] },
  },
  { source: "components/ui/student-catalogue-card.tsx", category: "content", kind: "component", demoId: "cards", relatedSources: ["components/ui/student-catalogue-card-variants.ts"] },
  { source: "components/ui/sunken-tabs.tsx", category: "navigation", kind: "component", demoId: "specialty-tabs" },
  { source: "components/ui/switch.tsx", category: "forms", kind: "component", demoId: "choice-controls" },
  { source: "components/ui/table.tsx", category: "data", kind: "component", demoId: "data-tables" },
  {
    source: "components/ui/tabs-variants.ts",
    category: "navigation",
    kind: "variant-source",
    demoId: "tabs",
    relatedSources: ["components/ui/tabs.tsx"],
    supportOnlyReason: "Defines the Tabs list treatment; the visual states are demonstrated with Tabs.",
    variants: { variant: ["default", "line"] },
  },
  { source: "components/ui/tabs.tsx", category: "navigation", kind: "component", demoId: "tabs", relatedSources: ["components/ui/tabs-variants.ts"] },
  {
    source: "components/ui/toast-on-mount.tsx",
    category: "feedback",
    kind: "helper",
    demoId: "notifications",
    relatedSources: ["components/ui/sonner.tsx", "components/ui/toast.ts"],
    supportOnlyReason: "Mount-time toast helper used to exercise the shared Sonner surface.",
  },
  {
    source: "components/ui/toast.ts",
    category: "feedback",
    kind: "helper",
    demoId: "notifications",
    relatedSources: ["components/ui/sonner.tsx"],
    supportOnlyReason: "Exports the imperative toast API and variants; rendered feedback belongs in Sonner.",
    variants: { variant: ["default", "success", "error", "warning", "info"] },
  },
  { source: "components/ui/tooltip.tsx", category: "feedback", kind: "component", demoId: "popovers-tooltips" },
  {
    source: "components/ui/typed-route-state.tsx",
    category: "feedback",
    kind: "component",
    demoId: "empty-states",
    variants: { kind: ["archived", "broken", "cached", "demo", "empty", "error", "loading", "no-attempt", "not-found", "unavailable"] },
  },
  {
    source: "components/ui/use-action-toast.ts",
    category: "feedback",
    kind: "helper",
    demoId: "notifications",
    relatedSources: ["components/ui/sonner.tsx"],
    supportOnlyReason: "Hook for action-linked feedback; it has no standalone visual state.",
  },
  {
    source: "components/dashboard/index.ts",
    category: "developer",
    kind: "barrel",
    demoId: "reference-content",
    supportOnlyReason: "Re-exports dashboard reference components and contracts; it has no separate rendering behavior.",
  },
  { source: "components/dashboard/reference-dashboard-controls.tsx", category: "controls", kind: "component", demoId: "reference-controls" },
  { source: "components/dashboard/reference-dashboard-preview.tsx", category: "developer", kind: "component", demoId: "reference-content" },
  { source: "components/dashboard/reference-dashboard-primitives.tsx", category: "surfaces", kind: "component", demoId: "reference-surfaces" },
  { source: "components/dashboard/reference-dashboard-shell.tsx", category: "navigation", kind: "component", demoId: "reference-content" },
  {
    source: "components/dashboard/reference-dashboard-tokens.ts",
    category: "developer",
    kind: "token-contract",
    demoId: "reference-surfaces",
    relatedSources: ["components/dashboard/reference-dashboard-primitives.tsx", "components/dashboard/reference-dashboard-controls.tsx"],
    supportOnlyReason: "Exports reusable class maps and status labels consumed by the reference dashboard examples.",
  },
  { source: "components/dashboard/reference-select-field.tsx", category: "forms", kind: "component", demoId: "reference-controls" },
] as const satisfies readonly PrimitiveInventoryEntry[];
