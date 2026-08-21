# Vecalss LMS MVP Grand Plan

## Purpose

This plan translates the product specification and DBML into a practical MVP delivery path for the Vecalss LMS. The goal is to launch the smallest coherent product that supports the highest-priority student learning loop while leaving room for later kapten, admin, and AI workflows.

## MVP Product Goal

The MVP should let an enrolled student log in, land on a useful dashboard, study sequential modules, complete attached quizzes, take a timed tryout, and review their progress with actionable recommendations.

## Phase 0: Foundation

### Outcomes

- Establish the core Next.js application structure in `vecalss-app`
- Set up Prisma with a PostgreSQL-ready schema foundation
- Standardize linting, formatting, environment handling, and developer scripts
- Create a shared domain baseline from the specification and DBML

### Deliverables

- Prisma schema for the initial MVP domain
- Reusable database client and environment validation
- Project conventions for code quality and local development
- This grand plan plus implementation-oriented app documentation

## Phase 1: Authentication and Enrollment Base

### Scope

- Admin-provisioned student accounts
- Email/password authentication
- Session lifecycle
- Password reset
- Role assignment support for student, kapten, and admin roles

### Tables

- `users`
- `auth_identities`
- `auth_sessions`
- `password_reset_tokens`
- `login_attempts`
- `role_assignments`
- `student_profiles`

### Notes

- Registration remains external via Google Form in the current scope
- Kapten and admin auth should share the same identity foundation even if their UI ships later

## Phase 2: Student Learning Core

### Scope

- Dashboard shell
- Exam goals and onboarding target data
- Subtests, topics, and module taxonomy
- Sequential modules and prerequisites
- Module progress tracking
- Attached module quizzes

### Tables

- `exam_programs`
- `exam_events`
- `universities`
- `majors`
- `subtests`
- `topics`
- `modules`
- `module_assets`
- `module_prerequisites`
- `module_progress`
- `questions`
- `question_options`
- `module_quizzes`
- `quiz_items`
- `quiz_attempts`
- `quiz_attempt_answers`

### UX Goal

The student should always know what to study next and what has already been completed.

## Phase 3: Tryout and Progress Intelligence

### Scope

- Published tryout packages and sections
- Timed tryout sessions
- Answer submission and scoring
- Score breakdowns
- Topic and subtest performance aggregates
- Dashboard recommendations

### Tables

- `tryout_packages`
- `tryout_sections`
- `tryout_items`
- `tryout_sessions`
- `tryout_answers`
- `tryout_score_breakdowns`
- `student_topic_performance`
- `student_subtest_performance`
- `learning_recommendations`
- `analytics_events`

### UX Goal

The student should finish a tryout and immediately understand performance, weaknesses, and next actions.

## Phase 4: Supporting Experience

### Scope

- Landing page CMS content
- Announcements and banners
- Daily missions and streaks
- Notifications
- Kapten monitoring surfaces
- Admin operational views

### Notes

These are important, but they should not delay the first end-to-end student learning loop.

## Suggested Technical Architecture

### Application

- Next.js App Router
- TypeScript
- Tailwind CSS v4

### Data Layer

- Prisma ORM
- PostgreSQL
- Server-only database access for the initial MVP

### Quality

- ESLint
- Prettier
- Typed environment validation

### Near-Term Backend Direction

- Start with Next server components, route handlers, and server actions where appropriate
- Add a dedicated auth provider only after the domain model and student flows are stable
- Keep service boundaries internal until real scaling pressure appears

## Delivery Order

1. Foundation and schema baseline
2. Authentication and protected app shell
3. Taxonomy and module browsing
4. Module progress and quizzes
5. Tryout flow and scoring
6. Dashboard analytics and recommendations
7. Kapten and admin tooling
8. Vera AI and adaptive features

## Risks To Manage Early

- The DBML is broad; the MVP must stay disciplined and avoid implementing every table immediately
- Authentication choices can create rework if they are made before the enrollment model is clear
- Tryout timing and reconnect behavior are deceptively complex and should be designed before coding the full flow
- AI features should stay out of the critical path for launch readiness

## Definition Of A Good MVP

The MVP is successful when a real student can sign in, see a meaningful home view, complete learning content, take an assessment, and receive progress feedback without needing kapten or admin intervention.
