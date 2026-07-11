# GUIDE_KAPTEN_PAGE

## Goal

Design a **Kapten Workspace** for the Vecalss Learning Management System (LMS).

This workspace is **not** a student management dashboard.

Instead, it is the primary place where Kapten create, organize, review, and publish learning content for students.

The workspace should feel like a modern content management system (CMS) built specifically for educational content.

A Kapten's primary responsibility is producing high-quality learning materials, quizzes, and tryouts—not monitoring student analytics.

---

## Product Philosophy

When a Kapten opens Vecalss, they should immediately know:

> "What should I continue working on today?"

The experience should prioritize unfinished work, recently edited content, and quick access to content creation.

Avoid turning the dashboard into a reporting or analytics page.

Analytics belong to another role within the system and should not influence this workspace.

---

## Primary Responsibilities

The Kapten workspace should help users:

- Continue editing unfinished work
- Create new learning materials
- Build quizzes
- Manage question banks
- Create tryouts
- Schedule content publication
- Organize educational resources

Everything else should remain secondary.

---

## Information Architecture

The workspace should be organized around content creation rather than student management.

Suggested navigation:

```text
Dashboard

Learning Content
    Materi
    Quiz
        Question Bank
    Tryout

Media

Settings
```

This structure is only an example.

If another organization provides a better user experience while preserving the same workflow, feel free to adapt it.

---

## Dashboard

The dashboard should feel like a personal workspace rather than an administration panel.

Instead of large statistics or charts, it should focus on helping Kapten resume their work.

Suggested sections include:

- Greeting
- Continue Editing
- Drafts
- Scheduled Publications
- Quick Create
- Recently Edited

The interface should remain intentionally calm and uncluttered.

Every section should help the user perform an action rather than simply displaying information.

---

## Greeting

A welcoming greeting helps reinforce that this is a personal workspace.

For example:

> Good Morning, Ravel 👋

Avoid generic page titles such as "Dashboard" as the primary visual focus.

---

## Continue Editing

This should be one of the most prominent sections.

It should help Kapten immediately resume unfinished work.

Prioritize recently edited content.

Example:

- Quiz PBM
- Video PPU
- TO 17

Keep this section lightweight and easy to scan.

---

## Drafts

Drafts represent unfinished content that still requires attention.

Drafts should feel like work waiting to be completed rather than a statistic.

The workflow is intentionally simple:

Draft → Scheduled → Published

---

## Scheduled Publications

Kapten should easily see which learning resources are planned for future publication.

This allows them to review upcoming releases without needing a complex calendar interface.

---

## Quick Create

Creating new content should always be easy.

A single entry point that lets users choose between creating:

- Materi
- Quiz
- Tryout

is encouraged.

The exact interaction is flexible.

---

## Recently Edited

Display recently edited learning resources so Kapten can quickly jump back into previous work.

Recently edited content should be prioritized over recently created content.

---

# Learning Content

The workspace revolves around three primary resource types.

## Materi

Learning materials are organized by subject.

For example:

```text
Materi

PBM
    Video 1
    Video 2

PPU
    Video 1
    Video 2
```

Subjects are predefined by the system.

Kapten should not manage subjects.

A learning material may include:

- title
- description
- thumbnail
- embedded YouTube video
- supporting resources
- ordered sections
- publication status

The editing experience should feel comfortable for writing educational content rather than editing database records.

---

## Quiz

Quizzes are also grouped by subject.

Each quiz should support:

- question management
- reordering questions
- importing questions from a Question Bank
- previewing the student experience
- scheduling publication

Question Bank belongs naturally within the Quiz area instead of existing as a completely separate product.

---

## Question Bank

Questions should be reusable across multiple quizzes and tryouts.

Question management should encourage reuse rather than duplication.

---

## Tryout

Tryouts represent larger assessments.

Unlike quizzes, tryouts should guide Kapten through a creation process.

A multi-step wizard is preferred over a single long form.

An example flow might be:

1. Basic Information
2. Configure Subtests
3. Select Questions
4. Review
5. Schedule Publication

This flow is only an example.

The exact steps may change if a better experience is discovered.

Questions should preferably be selected from the Question Bank rather than recreated.

---

## Media

For the current scope, Media only needs to manage image assets.

The structure should remain extensible for future asset types without introducing unnecessary complexity today.

---

## Search

Searching should help Kapten find learning content quickly.

Page-level search is sufficient for the first version.

The design should not prevent introducing a global search experience in the future.

---

## Empty States

A brand-new Kapten should receive helpful guidance.

For example:

> Welcome to the Vecalss CMS.

> Start by creating your first learning material.

Every empty state should provide a clear next action.

---

## Design Principles

The interface should feel:

- calm
- focused
- operational
- content-first
- familiar
- lightweight

Avoid making the interface feel like:

- an analytics dashboard
- a CRM
- a student management system
- an admin reporting tool

The goal is to help Kapten stay in a creative flow while building educational content.

---

## Future Considerations

The workspace should be designed so future roles (such as Academic Manager or Administrator) can introduce analytics and reporting without requiring major redesigns to the Kapten experience.

For the first version, optimize exclusively for content creation.

---

## Collaboration

For the first version, assume each learning resource is owned and edited by a single Kapten.

The interface should not introduce collaborative editing, presence indicators, conflict resolution, or permission management.

However, the overall design should remain flexible enough that collaboration could be added in the future without requiring fundamental changes to the product structure.
