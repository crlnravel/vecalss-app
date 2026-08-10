"use client";

import { useEffect } from "react";

import { findVisibleFocusTarget } from "./focus-target";

function FocusRestorer({
  announcementId,
  fallbackId,
  noticeId,
  targetId,
}: {
  announcementId?: string;
  fallbackId?: string;
  noticeId?: string;
  targetId?: string | null;
}) {
  useEffect(() => {
    if (!targetId) {
      return;
    }

    const target = document.getElementById(targetId);
    const notice = noticeId ? document.getElementById(noticeId) : null;
    const fallback = fallbackId ? document.getElementById(fallbackId) : null;
    const focusTarget = findVisibleFocusTarget({
      heading: fallback,
      notice,
      preferNotice: true,
      target: target instanceof HTMLElement ? target : null,
    });

    const announcement = announcementId ? document.getElementById(announcementId) : null;
    if (announcement instanceof HTMLElement) {
      announcement.textContent = focusTarget === target
        ? "Returned to the selected directory row."
        : "The selected row is no longer available. Focus moved to the current directory context.";
    }

    if (!(focusTarget instanceof HTMLElement)) {
      return;
    }

    focusTarget.focus({ preventScroll: true });
    focusTarget.scrollIntoView({ block: "nearest" });
  }, [announcementId, fallbackId, noticeId, targetId]);

  return null;
}

export { FocusRestorer };
