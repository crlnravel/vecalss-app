type FocusTargetOptions = {
  heading?: HTMLElement | null;
  notice?: HTMLElement | null;
  preferNotice?: boolean;
  rowSelector?: string;
  target?: HTMLElement | null;
  triggerSelector?: string;
};

function isVisibleFocusTarget(element: Element | null): element is HTMLElement {
  if (typeof HTMLElement === "undefined" || !(element instanceof HTMLElement) || !element.isConnected) {
    return false;
  }

  if (element.hidden || element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none"
    && style.visibility !== "hidden"
    && element.getClientRects().length > 0;
}

function firstVisibleFocusTarget(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisibleFocusTarget) ?? null;
}

function findVisibleFocusTarget({
  heading,
  notice,
  preferNotice = false,
  rowSelector = "[data-directory-row]",
  target,
  triggerSelector = "[data-attention-trigger]",
}: FocusTargetOptions) {
  const visibleTarget = target && isVisibleFocusTarget(target) ? target : null;
  const visibleTargetRow = visibleTarget && visibleTarget.matches(rowSelector) ? visibleTarget : null;
  const visibleTargetTrigger = visibleTarget && !visibleTargetRow && visibleTarget.matches(triggerSelector)
    ? visibleTarget
    : null;
  const visibleHeading = heading && isVisibleFocusTarget(heading) ? heading : null;
  const visibleNotice = notice && isVisibleFocusTarget(notice) ? notice : null;
  const contextCandidates = preferNotice
    ? [visibleNotice, visibleHeading]
    : [visibleHeading, visibleNotice];
  const candidates = [
    visibleTargetRow,
    firstVisibleFocusTarget(rowSelector),
    visibleTargetTrigger,
    firstVisibleFocusTarget(triggerSelector),
    ...contextCandidates,
  ];

  return candidates.find((candidate): candidate is HTMLElement => candidate !== null) ?? null;
}

export { findVisibleFocusTarget, firstVisibleFocusTarget, isVisibleFocusTarget };
