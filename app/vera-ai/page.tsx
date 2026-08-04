import { Suspense } from "react";

import { requireStudentSession } from "@/lib/auth/access";
import { VeraAiPageModule } from "@/modules/vera-ai/VeraAiPageModule";

export default async function VeraAiPage() {
  const session = await requireStudentSession();

  return (
    <Suspense fallback={<div className="min-h-svh bg-primary-50" />}>
      <VeraAiPageModule session={session} />
    </Suspense>
  );
}
