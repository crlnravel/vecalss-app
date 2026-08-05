# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a Student, called a Voyager in the product. They are an
Indonesian student preparing for PTN admission through a structured program of
learning materials, practice, quizzes, tryouts, and mentoring. Their job is to
understand what to study next, keep a consistent rhythm, and build readiness
for the relevant UTBK/SNBT/TKA exams.

Kapten (tutors/content authors) and Administrators are additional role-based
users. Kapten create, organize, review, and publish learning content;
Administrators handle enrollment and platform operations. These workflows are
intentionally separate from the student experience.

## Product Purpose

Vecalss is a web learning academy and learning management system for helping
Indonesian students prepare for PTN through a clear, sustained learning
journey. It brings together subject-based Materi, Kuis, reusable question banks,
Tryout assessments, progress, onboarding, and human guidance so a Voyager can
move from fundamentals to exam readiness without losing direction.

Success means students can identify and complete the next useful learning
activity, maintain consistent progress, and learn from assessment results.
Kapten should be able to produce and publish high-quality content without a
student-management dashboard becoming the center of their work.

## Positioning

Vecalss combines an integrated learning loop (Materi → Kuis → Tryout →
progress and next steps) with human mentoring from Kapten. Its position is not
just a content library or a test engine: learning activities and personal
guidance are designed to reinforce one another across the student's journey.

## Operating Context

- Students sign in, complete first-login onboarding when needed, browse Materi
  organized by subject, take Kuis, register for and complete Tryout sessions,
  review results, and manage their profile and notifications.
- Kapten work from a focused content workspace. Their core flow is to resume
  unfinished work, create or edit Materi and Kuis, reuse questions from the
  Bank Soal, build Tryout packages, manage publication timing, and use Media
  assets.
- Administrators manage student enrollment and related account operations.
- The product operates in Indonesian education terminology and the PTN,
  UTBK, SNBT, and TKA preparation context.

## Capabilities and Constraints

- Current product areas include public marketing and contact surfaces,
  authentication and password recovery, student onboarding, student learning
  surfaces, Kapten content authoring, administrator enrollment, notifications,
  profile/settings, Media, and Tryout participant flows.
- Learning content is organized around predefined subjects. Kuis questions are
  reusable through a Question Bank, and Tryout creation is treated as a larger
  assessment workflow rather than a single undifferentiated form.
- Role boundaries and access controls are part of the product contract:
  student, Kapten/tutor, and administrator routes must remain distinct.
- The existing technical foundation is a Next.js App Router web application
  using React, pnpm, Prisma, and PostgreSQL with the current authentication and
  session model. Future UI work should fit this foundation unless the user
  explicitly changes it.
- The repository contains a Vera AI surface and supporting product language;
  future work must not invent recommendation behavior or claims beyond what
  the implemented experience can support.
- Search, analytics, pricing, licensing, deployment guarantees, and other
  product claims are not established here unless supported by the current
  implementation or later confirmed by the user.

## Brand Commitments

- The product name is Vecalss / Vecalss Learning Academy.
- Students are Voyager and tutors/content authors are Kapten; this terminology
  is part of the product language.
- Existing voyage and learning-journey language, mascot and illustration
  assets, campus marks, alumni materials, mentor imagery, testimonials, and
  related proof assets are commitments to preserve unless the user changes
  them.
- Existing Indonesian copy and PTN-preparation framing should remain truthful
  and understandable to the intended audience.

## Evidence on Hand

- `README.md` documents the current app, demo setup, seeded journeys, role
  accounts, and implemented route families.
- `GUIDE_KAPTEN_PAGE.md` records the intended Kapten workspace direction:
  content creation, unfinished work, publication, reusable questions, and a
  calm personal workflow rather than analytics-first administration.
- The App Router and modules under `app/` and `modules/` provide the current
  implemented flows for students, Kapten, and administrators.
- `public/brand/` and `public/landing-assets/` contain the current Vecalss logo,
  mascot, voyage illustrations, campus marks, mentor imagery, alumni imagery,
  testimonials, and related assets.
- Prisma seed and fixture files provide local demonstration data, including
  UTBK subjects and sample assessment journeys. Demo fixtures, placeholders,
  and seeded accounts are not production proof and must not be presented as
  verified customer outcomes without confirmation.

## Product Principles

1. Make consistent progress easier than last-minute cramming.
2. Connect every practice activity to a clear learning path and next step.
3. Keep human mentoring in the loop alongside digital content and assessment.
4. Give each role a focused workspace designed around its actual job.
5. Preserve trust by distinguishing verified proof from demo, placeholder, or
   planned content.
