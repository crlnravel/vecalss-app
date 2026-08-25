import { redirect } from "next/navigation";

export default async function TryoutRegistrationPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const { tryoutId } = await params;
  redirect(`/tryout/${tryoutId}`);
}
