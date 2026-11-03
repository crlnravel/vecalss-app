import { handlePaymentEventRequest } from "@/lib/payments/inbox-http";
import { getPaymentProvider } from "@/lib/payments/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Provider events arrive here, signed. Browser return pages never establish payment. */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return handlePaymentEventRequest(request, provider, { getProvider: () => getPaymentProvider() });
}
