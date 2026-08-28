"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

import { REFERENCE_NAV_CLASS_NAMES, REFERENCE_SURFACE_CLASS_NAMES } from "./reference-dashboard-tokens";

type ReferenceDashboardNavItem = {
  badge?: ReactNode;
  href: string;
  /**
   * Keep icons as rendered nodes so server routes can pass navigation through
   * the client shell without serializing component functions.
   */
  icon: ReactNode;
  label: string;
};

type ReferenceDashboardNavGroup = {
  items: readonly ReferenceDashboardNavItem[];
  label: string;
};

type ReferenceDashboardShellProps = {
  brand?: ReactNode;
  brandMark?: ReactNode;
  brandHref?: string;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  header?: ReactNode;
  mainClassName?: string;
  mobilePrimaryNavigation?: readonly ReferenceDashboardNavItem[];
  navigation: readonly ReferenceDashboardNavGroup[];
};

function ReferenceDashboardShell({
  brand,
  brandMark,
  brandHref = "/",
  children,
  className,
  footer,
  header,
  mainClassName,
  mobilePrimaryNavigation,
  navigation,
}: ReferenceDashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const wasMobileMenuOpen = useRef(false);
  const items = useMemo(() => navigation.flatMap((group) => group.items), [navigation]);
  const mobileItems = mobilePrimaryNavigation ?? items.slice(0, 4);
  const activeHref = resolveActiveHref(pathname, items);
  const hasHiddenActiveMobileItem =
    activeHref !== null && !mobileItems.some((item) => item.href === activeHref);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const closeForLargerViewport = () => {
      if (mediaQuery.matches) setMobileMenuOpen(false);
    };

    closeForLargerViewport();
    mediaQuery.addEventListener("change", closeForLargerViewport);
    return () => mediaQuery.removeEventListener("change", closeForLargerViewport);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen && wasMobileMenuOpen.current) {
      mobileMenuButtonRef.current?.focus();
    }
    wasMobileMenuOpen.current = mobileMenuOpen;
  }, [mobileMenuOpen]);

  return (
    <div className={cn("min-h-svh bg-secondary-50 text-secondary-900", className)}>
      <div inert={mobileMenuOpen || undefined}>
        <div className="lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-6 lg:p-6">
          <ReferenceDesktopSidebar
            activeHref={activeHref}
            brand={brand}
            brandMark={brandMark}
            brandHref={brandHref}
            collapsed={collapsed}
            footer={footer}
            navigation={navigation}
            onToggle={() => setCollapsed((value) => !value)}
          />

          <div className="min-w-0">
            <header className="sticky top-0 z-30 border-b border-primary-100/80 bg-secondary-50/90 backdrop-blur-xl lg:top-6 lg:rounded-3xl lg:border">
              <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-6">
                <div className="md:hidden">
                  <ReferenceMenuButton
                    buttonRef={mobileMenuButtonRef}
                    controls="reference-dashboard-mobile-nav"
                    expanded={mobileMenuOpen}
                    onClick={() => setMobileMenuOpen(true)}
                  />
                </div>
                <div className="min-w-0 flex-1">{header}</div>
                <div className="hidden shrink-0 items-center gap-2 md:flex lg:hidden">
                  {brand ? (
                    <Link
                      aria-label="Kembali ke beranda ruang kerja"
                      className="truncate text-sm font-semibold text-secondary-900"
                      href={brandHref}
                    >
                      {brand}
                    </Link>
                  ) : null}
                </div>
              </div>
            </header>

            <main
              className={cn(
                "mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[1420px] flex-col gap-7 px-4 py-8 pb-28 md:px-8 lg:px-10 lg:py-10",
                mainClassName,
              )}
            >
              {children}
            </main>
          </div>
        </div>

        <ReferenceTabletNav
          activeHref={activeHref}
          brand={brand}
          brandHref={brandHref}
          items={items}
        />
        <ReferenceMobileNav
          activeHref={activeHref}
          hasHiddenActive={hasHiddenActiveMobileItem}
          items={mobileItems}
          menuOpen={mobileMenuOpen}
          onMore={() => setMobileMenuOpen(true)}
        />
      </div>
      <ReferenceMobileDrawer
        activeHref={activeHref}
        brand={brand}
        brandHref={brandHref}
        navigation={navigation}
        onClose={() => setMobileMenuOpen(false)}
        open={mobileMenuOpen}
      />
    </div>
  );
}

function ReferenceDesktopSidebar({
  activeHref,
  brand,
  brandMark,
  brandHref,
  collapsed,
  footer,
  navigation,
  onToggle,
}: {
  activeHref: string | null;
  brand?: ReactNode;
  brandMark?: ReactNode;
  brandHref: string;
  collapsed: boolean;
  footer?: ReactNode;
  navigation: readonly ReferenceDashboardNavGroup[];
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        REFERENCE_SURFACE_CLASS_NAMES.raised,
        "sticky top-6 z-20 hidden h-[calc(100svh-3rem)] flex-col overflow-hidden p-3 transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("mb-7 flex min-h-11 items-center", collapsed ? "justify-center" : "px-2")}>
        <Link
          aria-label="Kembali ke beranda ruang kerja"
          className={cn(
            "flex min-h-11 min-w-11 items-center rounded-2xl text-sm font-semibold text-secondary-900 transition-colors hover:bg-primary-50",
            collapsed ? "justify-center" : "w-full gap-2 px-2",
          )}
          href={brandHref}
        >
          {collapsed
            ? brandMark ?? <span aria-hidden="true" className="size-3 rounded-full bg-primary-700" />
            : brand ?? <span aria-hidden="true" className="size-3 rounded-full bg-primary-700" />}
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {navigation.map((group) => (
          <ReferenceNavGroup
            activeHref={activeHref}
            collapsed={collapsed}
            group={group}
            key={group.label}
          />
        ))}
      </div>

      {footer ? <div className={cn("mt-4", collapsed && "hidden")}>{footer}</div> : null}
      <button
        aria-label={collapsed ? "Buka navigasi" : "Ciutkan navigasi"}
        className={cn(
          "mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl border border-primary-100 bg-primary-50/60 text-secondary-500 transition-[background-color,box-shadow,color] hover:bg-primary-50 hover:text-secondary-900 focus-visible:border-primary-400 focus-visible:ring-3 focus-visible:ring-primary-300/35",
          collapsed ? "" : "justify-end px-4",
        )}
        onClick={onToggle}
        type="button"
      >
        {collapsed ? (
          <ChevronRight aria-hidden="true" className="size-4" />
        ) : (
          <ChevronLeft aria-hidden="true" className="size-4" />
        )}
      </button>
    </aside>
  );
}

function ReferenceNavGroup({
  activeHref,
  collapsed,
  group,
  onNavigate,
}: {
  activeHref: string | null;
  collapsed: boolean;
  group: ReferenceDashboardNavGroup;
  onNavigate?: () => void;
}) {
  return (
    <div className="mb-6">
      {!collapsed ? (
        <p className="mb-2 px-3 text-ui-xs font-semibold tracking-[0.14em] text-secondary-500 uppercase">
          {group.label}
        </p>
      ) : null}
      <nav aria-label={group.label} className="space-y-1">
        {group.items.map((item) => (
          <ReferenceNavLink
            active={activeHref === item.href}
            collapsed={collapsed}
            item={item}
            key={item.href}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </div>
  );
}

function ReferenceNavLink({
  active,
  collapsed,
  item,
  onNavigate,
}: {
  active: boolean;
  collapsed?: boolean;
  item: ReferenceDashboardNavItem;
  onNavigate?: () => void;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-[background-color,color,box-shadow] focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-primary-300/35",
        collapsed ? "justify-center" : "justify-start",
        active ? REFERENCE_NAV_CLASS_NAMES.active : REFERENCE_NAV_CLASS_NAMES.base,
      )}
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
    >
      <span
        aria-hidden="true"
        className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-full"
      >
        {item.icon}
      </span>
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
      {!collapsed && item.badge ? <span className="shrink-0">{item.badge}</span> : null}
    </Link>
  );
}

function ReferenceTabletNav({
  activeHref,
  brand,
  brandHref,
  items,
}: {
  activeHref: string | null;
  brand?: ReactNode;
  brandHref: string;
  items: readonly ReferenceDashboardNavItem[];
}) {
  return (
    <nav
      aria-label="Navigasi ruang kerja"
      className="fixed bottom-4 left-1/2 z-40 hidden max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-3xl border border-primary-100 bg-white/95 p-2 shadow-[0_18px_42px_-30px_rgba(23,107,77,0.6)] backdrop-blur md:flex lg:hidden"
    >
      {brand ? (
        <Link
          aria-label="Kembali ke beranda ruang kerja"
          className="mr-1 flex min-h-11 items-center gap-2 border-r border-primary-100 px-3 text-sm font-semibold text-secondary-900"
          href={brandHref}
        >
          {brand}
        </Link>
      ) : null}
      {items.map((item) => (
        <ReferenceCompactNavLink active={activeHref === item.href} item={item} key={item.href} />
      ))}
    </nav>
  );
}

function ReferenceMobileNav({
  activeHref,
  hasHiddenActive,
  items,
  menuOpen,
  onMore,
}: {
  activeHref: string | null;
  hasHiddenActive: boolean;
  items: readonly ReferenceDashboardNavItem[];
  menuOpen: boolean;
  onMore: () => void;
}) {
  return (
    <nav
      aria-label="Navigasi ruang kerja"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around gap-1 border-t border-primary-100 bg-white/95 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_42px_-34px_rgba(23,107,77,0.55)] backdrop-blur md:hidden"
    >
      {items.map((item) => (
        <ReferenceCompactNavLink active={activeHref === item.href} item={item} key={item.href} />
      ))}
      <button
        aria-controls="reference-dashboard-mobile-nav"
        aria-expanded={menuOpen}
        aria-label={hasHiddenActive ? "Buka navigasi lainnya (halaman aktif)" : "Buka navigasi lainnya"}
        className={cn(
          "flex min-h-11 min-w-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-ui-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-primary-300/35",
          hasHiddenActive ? REFERENCE_NAV_CLASS_NAMES.active : REFERENCE_NAV_CLASS_NAMES.base,
        )}
        onClick={onMore}
        type="button"
      >
        <Menu aria-hidden="true" className="size-5" />
        <span className="uppercase tracking-[0.05em]">Lainnya</span>
      </button>
    </nav>
  );
}

function ReferenceCompactNavLink({
  active,
  item,
}: {
  active: boolean;
  item: ReferenceDashboardNavItem;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={cn(
        "flex min-h-11 min-w-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-ui-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-primary-300/35",
        active ? REFERENCE_NAV_CLASS_NAMES.active : REFERENCE_NAV_CLASS_NAMES.base,
      )}
      href={item.href}
    >
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center [&>svg]:size-full"
      >
        {item.icon}
      </span>
      <span className="truncate uppercase tracking-[0.05em]">{item.label}</span>
    </Link>
  );
}

function ReferenceMobileDrawer({
  activeHref,
  brand,
  brandHref,
  navigation,
  onClose,
  open,
}: {
  activeHref: string | null;
  brand?: ReactNode;
  brandHref: string;
  navigation: readonly ReferenceDashboardNavGroup[];
  onClose: () => void;
  open: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        aria-label="Tutup navigasi"
        className={cn(
          "absolute inset-0 bg-secondary-900/20 backdrop-blur-sm transition-opacity",
          "opacity-100",
        )}
        onClick={onClose}
        type="button"
      />
      <aside
        id="reference-dashboard-mobile-nav"
        aria-label="Navigasi ruang kerja"
        aria-labelledby="reference-dashboard-mobile-nav-title"
        aria-modal="true"
        className={cn(
          "absolute inset-x-0 bottom-0 translate-y-0 rounded-t-4xl border border-primary-100 bg-white p-5 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-24px_64px_-38px_rgba(23,107,77,0.55)]",
        )}
        onKeyDown={handleDrawerKeyDown}
        role="dialog"
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-primary-200" />
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="sr-only" id="reference-dashboard-mobile-nav-title">
            Navigasi ruang kerja
          </h2>
          <Link
            aria-label="Kembali ke beranda ruang kerja"
            className="min-w-0 truncate text-sm font-semibold text-secondary-900"
            href={brandHref}
            onClick={onClose}
          >
            {brand ?? "Ruang kerja"}
          </Link>
          <button
            aria-label="Tutup navigasi"
            className="flex size-11 items-center justify-center rounded-2xl border border-primary-100 bg-primary-50 text-secondary-500 transition-colors hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35"
            autoFocus
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="max-h-[60svh] space-y-5 overflow-y-auto">
          {navigation.map((group) => (
            <ReferenceNavGroup
              activeHref={activeHref}
              collapsed={false}
              group={group}
              key={group.label}
              onNavigate={onClose}
            />
          ))}
        </div>
      </aside>
    </div>
  );
}

function handleDrawerKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;

  const focusableElements = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );

  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function ReferenceMenuButton({
  buttonRef,
  controls,
  expanded,
  onClick,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  controls: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label="Buka navigasi ruang kerja"
      className="flex size-11 items-center justify-center rounded-2xl border border-primary-100 bg-white text-secondary-500 transition-colors hover:bg-primary-50 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35"
      onClick={onClick}
      ref={buttonRef}
      type="button"
    >
      <Menu aria-hidden="true" className="size-5" />
    </button>
  );
}

function resolveActiveHref(
  pathname: string | null,
  items: readonly ReferenceDashboardNavItem[],
) {
  if (!pathname) return null;

  return (
    items
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
  );
}

export { ReferenceDashboardShell };
export type {
  ReferenceDashboardNavGroup,
  ReferenceDashboardNavItem,
  ReferenceDashboardShellProps,
};
