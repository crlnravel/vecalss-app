/** Only use in authorized, owner-scoped mentor projections (D5). */
export function mentorParticipantIdentity(student: { fullName: string | null; email: string }) {
  return { displayName: student.fullName?.trim() || student.email, email: student.email };
}
