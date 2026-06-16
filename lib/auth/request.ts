import { headers } from "next/headers";

type RequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

async function getRequestMetadata(): Promise<RequestMetadata> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim()
    || requestHeaders.get("x-real-ip")
    || null;
  const userAgent = requestHeaders.get("user-agent");

  return {
    ipAddress,
    userAgent,
  };
}

export { getRequestMetadata };
