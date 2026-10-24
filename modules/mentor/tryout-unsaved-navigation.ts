type NavigationIntent = {
  button: number; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean;
  dirty: boolean; currentHref: string; destinationHref: string; opensElsewhere?: boolean;
};

/** A normal link click that leaves the current editor must resolve unsaved work. */
export function tryoutNavigationNeedsGuard(intent: NavigationIntent) {
  if (!intent.dirty || intent.opensElsewhere || intent.button !== 0 || intent.altKey || intent.ctrlKey || intent.metaKey || intent.shiftKey) return false;
  const current = new URL(intent.currentHref);
  const destination = new URL(intent.destinationHref, current);
  return destination.protocol === "http:" || destination.protocol === "https:"
    ? destination.origin !== current.origin || destination.pathname !== current.pathname || destination.search !== current.search
    : false;
}
