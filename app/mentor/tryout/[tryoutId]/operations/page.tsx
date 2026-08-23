import { redirect } from "next/navigation";

export default async function TryoutOperationsPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const { tryoutId } = await params;
  redirect(`/mentor/tryout/${tryoutId}?workspace=schedule&delivery=sessions`);
}
