export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    {
      instanceId: process.env.INSTANCE_ID ?? "unknown",
      pid: process.pid,
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
