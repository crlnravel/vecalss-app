import { handleEditLeaseCommand } from "@/lib/resource-edit-lock/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleEditLeaseCommand(request, "release");
}
