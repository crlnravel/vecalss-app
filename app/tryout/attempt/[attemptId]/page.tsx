import { requireStudentSession } from "@/lib/auth/access";
import { TypedRouteState } from "@/components/ui/typed-route-state";
import { canonicalContextMessage, parseStudentTryoutContext, type NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { ParticipantAttemptModule } from "@/modules/tryout/ParticipantAttemptModule";

export default async function TryoutAttemptPage({ params, searchParams }: { params: Promise<{ attemptId: string }>; searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const [{ attemptId }, query] = await Promise.all([params, searchParams, requireStudentSession()]);
  const parsed = parseStudentTryoutContext(query);
  if (parsed.issues.length) {
    return <TypedRouteState context="Pilih kembali sesi Tryout dari tautan yang masih berlaku." description={canonicalContextMessage(parsed.issues) ?? "Konteks percobaan Tryout tidak tersedia."} kind="unavailable" returnHref={parsed.returnTo ?? "/tryout"} returnLabel="Kembali ke Tryout" title="Konteks percobaan tidak tersedia" />;
  }
  return <ParticipantAttemptModule attemptId={attemptId} returnToHref={parsed.returnTo} sessionId={parsed.session} />;
}
