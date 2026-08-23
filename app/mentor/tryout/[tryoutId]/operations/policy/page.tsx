import { redirect } from "next/navigation";

export default async function TryoutPolicyPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const { tryoutId } = await params;
  redirect(`/mentor/tryout/${tryoutId}?workspace=schedule&delivery=policy`);
}
