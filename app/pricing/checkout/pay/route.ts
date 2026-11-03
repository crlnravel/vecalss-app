import {
  handleCheckoutPayPost,
  handleCheckoutPayRedirect,
} from "@/lib/pricing/checkout-pay";

export const dynamic = "force-dynamic";

/** Starting checkout is a POST from the checkout page; see lib/pricing/checkout-pay.ts. */
export async function POST(request: Request) {
  return handleCheckoutPayPost(request);
}

/** Old links and bookmarks: no side effects, back to the checkout page. */
export function GET(request: Request) {
  return handleCheckoutPayRedirect(request);
}

export function HEAD(request: Request) {
  return handleCheckoutPayRedirect(request);
}
