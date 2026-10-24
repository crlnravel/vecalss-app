"use client";

import { useEffect, useRef } from "react";
import { tryoutNavigationNeedsGuard } from "@/modules/mentor/tryout-unsaved-navigation";

/** Capture before Next's client link handler, including operation and primary
 * workspace links outside the form. Reuse the owner's save/discard dialog. */
export function useTryoutUnsavedNavigation(dirty: boolean, onNavigate: (href: string) => void) {
  const callback = useRef(onNavigate);
  useEffect(() => { callback.current = onNavigate; }, [onNavigate]);
  useEffect(() => {
    if (!dirty) return;
    const intercept = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!anchor || event.defaultPrevented) return;
      if (!tryoutNavigationNeedsGuard({ ...event, button: event.button, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, dirty, currentHref: window.location.href, destinationHref: anchor.href, opensElsewhere: anchor.target === "_blank" || anchor.hasAttribute("download") })) return;
      event.preventDefault();
      event.stopPropagation();
      callback.current(anchor.href);
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [dirty]);
}
