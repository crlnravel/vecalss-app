import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createTa03Fixture } from "./tryout-ta03-fixture";
import { requireTa02LocalDatabase } from "./tryout-ta02-fixture";

/** Fresh future-only Tryouts; no seeded account creation or old QA history edits. */
export async function createF12Fixture(mode: "open" | "approval_required" | "invitation_only" = "open", studentEmail = "student@vecalss.local", availableFrom = new Date(Date.now() + 3 * 86_400_000)) {
  requireTa02LocalDatabase();
  if (availableFrom.getTime() <= Date.now()) throw new Error("F-12 fixture creation requires a future window; root arms live acceptance separately.");
  const fixture = await createTa03Fixture();
  const student = await prisma.user.findUniqueOrThrow({ where: { email: studentEmail }, select: { id: true, email: true } });
  const title = `F-12 ${mode} ${randomUUID().slice(0, 8)}`;
  await prisma.tryoutPackage.update({ where: { id: fixture.tryoutId }, data: { title, admissionMode: mode } });
  const session = await prisma.tryoutDeliverySession.update({ where: { id: fixture.sessionId }, data: { availableFrom, availableUntil: new Date(availableFrom.getTime() + 1_800_000) }, select: { id: true, availableFrom: true, availableUntil: true, assessmentReleaseId: true } });
  return { ...fixture, studentId: student.id, studentEmail: student.email, title, mode, session, registerRoute: `/tryout/${fixture.tryoutId}/register?session=${session.id}`, waitingRoute: `/tryout/${fixture.tryoutId}/waiting?session=${session.id}`, detailRoute: `/tryout/${fixture.tryoutId}?session=${session.id}` };
}
