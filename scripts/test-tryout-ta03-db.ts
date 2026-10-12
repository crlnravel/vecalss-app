import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { searchTryoutInvitationStudents } from "../lib/tryout/invitation-picker";
import { mentorParticipantIdentity } from "../lib/tryout/mentor-participant-identity";
import { createTa03Fixture } from "./tryout-ta03-fixture";

try {
  const fixture = await createTa03Fixture();
  await writeFile(new URL("../.scratch/tryout-ta03/fixtures.json", import.meta.url), JSON.stringify(fixture, null, 2));
  const student = fixture.students.find((item) => item.id === fixture.studentId)!;
  const matches = await searchTryoutInvitationStudents(fixture.tryoutId, fixture.ownerId, fixture.studentEmail);
  const selected = matches.find((item) => item.id === student.id);
  assert(selected, "an unregistered student is discoverable by account email");
  assert.deepEqual({ displayName: selected.displayName, email: (selected as unknown as { email: string }).email }, mentorParticipantIdentity(student), "picker uses the same approved account identity as participant list/detail");
  assert.equal(selected.admission, null, "new students are discoverable without a registration");
  console.log("TA-03 owned invitation identity search passed.");
} finally { await prisma.$disconnect(); }
