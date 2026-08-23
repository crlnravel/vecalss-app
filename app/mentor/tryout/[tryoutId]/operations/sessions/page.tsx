import { redirect } from "next/navigation";

export default async function TryoutSessionsPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const { tryoutId } = await params;
  redirect(`/mentor/tryout/${tryoutId}?workspace=schedule&delivery=sessions`);
}
