export const TRYOUT_RESULT_NAVIGATION_EVENT = "vecalss:tryout-result-navigation";
export function navigateTryoutResultHref(href: string, navigate: (href: string) => void) {
  const request = Object.assign(new Event(TRYOUT_RESULT_NAVIGATION_EVENT, { cancelable: true }), { href });
  if (window.dispatchEvent(request)) navigate(href);
}
