import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { duplicateTryout } from "../lib/tryout/repository";
import { openTryoutDeliverySession } from "../lib/tryout/delivery-repository";

/** Copy only Tryout data, preserving seeded accounts and peer fixtures. */
export async function createTa03Fixture() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || url.pathname !== "/vecalss_dev") throw new Error("TA-03 requires local vecalss_dev on port 55432.");
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "tutor@vecalss.local" }, select: { id: true } });
  const students = await prisma.user.findMany({ select: { id: true, fullName: true, email: true }, where: { status: "active", softDeletedAt: null, previewPurpose: null, studentProfile: { isNot: null }, roleAssignments: { some: { role: "student", revokedAt: null } } }, orderBy: { email: "asc" } });
  const student = students.find((item) => item.email === "student@vecalss.local");
  if (!student || students.length < 5) throw new Error("TA-03 requires the existing seeded Voyager and four students.");
  const source = await prisma.tryoutPackage.findFirstOrThrow({ where: { createdByUserId: owner.id, status: "published", sections: { every: { packageVersionId: null } }, items: { some: {} } }, orderBy: { createdAt: "asc" } });
  const copy = await duplicateTryout(source.id, owner.id);
  const title = `TA-03 invitations ${randomUUID().slice(0, 8)}`;
  await prisma.tryoutPackage.update({ where: { id: copy.id }, data: { title, admissionMode: "invitation_only", status: "published", publishedAt: new Date() } });
  await prisma.tryoutSection.updateMany({ where: { tryoutId: copy.id }, data: { scoringConfig: { method: "fixed_points", correctAnswerPoints: 1, wrongAnswerPoints: 0, unansweredPoints: 0 } } });
  const session = await prisma.tryoutDeliverySession.findFirstOrThrow({ where: { tryoutId: copy.id } });
  await prisma.tryoutDeliverySession.update({ where: { id: session.id }, data: { availableFrom: new Date(Date.now() + 3 * 86_400_000), availableUntil: new Date(Date.now() + 14 * 86_400_000), isDefaultOpenRegistration: true } });
  await openTryoutDeliverySession(session.id, owner.id, "Isolated local TA-03 fixture");
  return { tryoutId: copy.id, sessionId: session.id, ownerId: owner.id, studentId: student.id, studentEmail: student.email, title, students };
}
