---
target: all authenticated student pages (canonical shell target)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-08-10T14-35-32Z
slug: les-student-components-student-workspace-shell-tsx
---
Method: dual-agent (A: 34fbefe3-7586-490f-8beb-c3e76e3e61a6 · B: 8a32785d-207d-4d4d-8511-dd091d5d9ae0)

# Student page style consistency critique

## Scope and overall assessment

Read-only review of the authenticated student surface: shared shell, dashboard, Materi catalogue/path/reader, Kuis catalogue/detail/attempt/result, Tryout catalogue/detail/registration/waiting/attempt/result, Vera AI, Profil, Notifikasi, and Onboarding. Public Top Alumni was inspected only as a boundary check and is excluded from the verdict.

The inconsistency is real, but it is not simply “some cards use dark backgrounds.” The product has a strong core vocabulary—voyage green, sea-glass mint, soft-lifted white cards, rounded geometry—and the dark/gradient treatments are appropriate when they signal a hero, active journey node, media frame, or focused assessment state. The issue is that similar catalogue, status, badge, and action roles do not share a semantic contract. Materi feels like the canonical learning surface; Kuis, Tryout, onboarding, and standalone assessment routes each introduce a different card and color grammar.

Verdict: moderately consistent at the shell/Materi level, but not yet a coherent cross-page student system. No P0. Four P1 concerns should be addressed before a visual polish pass: two style-system contracts and two visibly inert/high-risk actions.

## Nielsen heuristic scores

| Heuristic | Score (0–4) | Evidence |
| --- | ---: | --- |
| Visibility of system status | 2 | Strong save/countdown/progress feedback in several flows, but search, mark-read, and profile-delete affordances are inert; unread/chart states are not durable. |
| Match between system and real world | 3 | Indonesian labels and voyage metaphor are clear; onboarding’s cyan/lime language weakens the shared metaphor. |
| User control and freedom | 2 | Navigation and confirmation patterns exist, but quiz exit is a no-op and some controls do nothing. |
| Consistency and standards | 2 | Shared shell/Materi are strong; card, badge, radius, shadow, and accent rules diverge across routes. |
| Error prevention | 2 | Locked/disabled states help, but the broken exit action and inconsistent state semantics undermine recovery. |
| Recognition rather than recall | 3 | Breadcrumbs, active nav, labels, filters, and question palettes help; badge/unread/step meanings are less consistent. |
| Flexibility and efficiency of use | 3 | Sidebar collapse, filters, question palettes, and Vera context tools are useful; global search is only visual. |
| Aesthetic and minimalist design | 2 | Materi, Tryout catalogue, and Vera are polished individually; the cross-page transitions feel stitched together. |
| Help users recognize, diagnose, and recover from errors | 2 | Alerts and retry paths exist, but inert actions and inconsistent status announcements reduce trust. |
| Help and documentation | 2 | Onboarding and tryout instructions help, but there is no consistent search/help or empty-data contract. |

Total: **23/40**.

## Independent detector and browser evidence

Assessment B ran the Impeccable detector over the student modules/routes. Static JSON exit was 2 with **20 advisory/quality findings**: 18 `design-system-font-size` findings and 2 `design-system-color` findings. The exact locations were SettingsPageModule.tsx:105; onboarding-form.tsx:95,228,234; DashboardPageModule.tsx:121,128,277,338; CourseLearningPathPageModule.tsx:195,373; MateriLessonPresentation.tsx:146; QuizResultPageModule.tsx:296; and VeraAiPageModule.tsx:592,1018,1043,1182,1215,1275,1383,1617. A raw `--no-config --no-design-system` scan returned no additional findings.

Fresh 1280×800 browser tabs were inspected on the existing Next server. Correct mutable injection and overlay cleanup succeeded on every inspected tab; cleanup ended with 0 overlays/style nodes. An initial extension-mode injection attempt failed and was corrected by reload. Route detector counts were: Dashboard 29, Materi catalogue 30, Materi detail 15, Kuis catalogue 16, Kuis detail 10, Tryout catalogue 15, Tryout detail 17, Settings 15, Notifications 7, Vera AI 12. Repeated heuristic findings included nested cards, broad shadows, and layout-transition; these are not all defects. `overused-font` is a false positive against the documented Plus Jakarta Sans; `ai-color-palette` is a false positive for documented deep-green/sea-glass gradients; sidebar transition findings are intentional. Concrete browser findings were 3.8:1 hero-copy contrast in course/tryout, missing heading levels on Tryout, and kicker-above-heading patterns on Kuis. The existing Next server remained running; the temporary Impeccable live server was stopped and its metadata cleared. Top Alumni was out of representative scope; onboarding redirects for the completed seeded account.

## What is working

- The shared shell in `modules/student/components/student-workspace-shell.tsx:70-139` and sidebar in `modules/student/components/student-sidebar.tsx:53-97` give every standard route a recognizable home, nav, header, and active state.
- Materi is the clearest expression of the declared “Playful Voyage Map”: the course row uses white/paper plus mint icon treatment and deep-green progress/action anchors; the learning path reserves stronger dark/tactile treatment for journey states.
- Tryout filters expose `aria-pressed`, attempt surfaces expose answer/feedback states, and Vera labels its workspace/context controls. These are good primitives to reuse in a shared state language.
- The design spec itself is directionally sound: it calls for deep green actions, sea-glass support surfaces, sparse warm sun, white resting cards, and deliberate tactile shadows (`DESIGN.md:112-139, 171-178, 233-255, 281-299`).

## Priority findings

### P1 — Badge and accent semantics are not defined

The shared `Badge` API has only `accent`, `mint`, and `neutral`, with `accent` defaulting to a green fill (`components/ui/badge-variants.ts:3-22`). Its `accent` ramp is effectively another primary-green ramp (`design-tokens/palette.mjs:28-39`), while actual attention states are split across `#F5C518`, `#FFD766`, `#ffda59`, amber, sky, and red classes. Most student badge-like elements are hand-built spans, so the same role changes geometry, fill, contrast, and meaning by route.

Impact: students cannot learn one visual meaning for “category,” “selected,” “unread,” “attention,” or “status.”

Recommendation: define semantic variants—`category`, `status-neutral`, `status-active`, `status-attention`, `status-success`, `status-error`, and `selected`—with one pill geometry. Decide whether `accent` means green emphasis or rename it; add a real warm-sun/attention token and migrate manual spans. Keep warm sun sparse as required by `DESIGN.md:136-160, 177-178`.

### P1 — Similar catalogue cards use incompatible visual contracts

Materi uses a white-to-paper row, mint icon block, text label, green progress, and solid green arrow (`modules/courses/CourseCataloguePageModule.tsx:133-181`). Kuis uses a pale-mint card with a dark top rail, dark icon block, white code pill, oversized title, and dark action circle (`modules/quiz/QuizCataloguePageModule.tsx:136-181`). Tryout adds art headers and sky/amber/green status fills (`modules/tryout/ParticipantTryoutWorkspace.tsx:210-230`).

Impact: the same decision—“which learning activity do I open?”—requires a new visual grammar on every page. The dark treatment is valid for hero/active emphasis, but it is currently also part of a subject-card identity without a shared contract.

Recommendation: establish a `StudentCard` contract: white resting surface, 1px soft green border, one 32px learning radius, ambient shadow, stable title/meta/action alignment, and gradients limited to icon/art/hero blocks. Allow Materi/Kuis/Tryout variants through explicit props, not ad hoc card markup.

### P1 — Persistent affordances look active but are inert

The shared search field has no query state or action (`modules/student/components/student-workspace-shell.tsx:107-115`); `Tandai sudah dibaca` has no handler (`modules/student/NotificationsPageModule.tsx:33-35`); and `Hapus foto` has no handler or disabled state (`modules/student/components/profile-photo-editor.tsx:129-137`).

Impact: rounded controls imply capability, but nothing changes. This is both a consistency problem and a trust problem.

Recommendation: wire each action with pending/success/error feedback, or remove/disable the affordance until supported. Keep the same button variants and focus treatment when implemented.

### P1 — The quiz exit confirmation is visually decisive but functionally a no-op

`modules/quiz/QuizOngoingPageModule.tsx:302-308` uses `onClick={() => onExit}` instead of invoking the callback. The same path uses neon `#ff0008`, which is louder and less tokenized than the shared destructive treatment.

Impact: a student confirming the highest-risk escape action remains in the timed attempt, undermining control and recovery.

Recommendation: invoke the callback, use the shared destructive variant/token, preserve focus behavior, and add a regression test for confirmation → navigation.

### P2 — Onboarding and immersive modes are not connected to the brand contract

Onboarding introduces cyan/lime illustrations, slate controls, cyan focus, and yellow CTAs (`modules/student/components/onboarding-form.tsx:25-48, 82-101, 158-190, 225-260`) instead of the green/sea-glass system. Quiz/Tryout attempt/result pages intentionally bypass the shared shell for focus, but use separate white/gray/yellow/red vocabularies without a documented assessment-mode contract. Vera is also a purposeful custom workspace.

Recommendation: retain distinct modes, but share semantic tokens, type ramp, focus ring, status chips, back/exit affordances, and branded orientation. Map onboarding to canvas/surface/ink/muted/border/sea-glass/warm-sun tokens; keep yellow only as a sparse attention/event color.

### P2 — Token and geometry drift makes future consistency difficult

The detector found 18 advisory font-size deviations and 2 undocumented dashboard chart colors across the student source scope. The token layer has no shared warm-sun semantic variable; `app/globals.css:63-124` also differs from the documented canvas/radius vocabulary. Student code adds raw hex values for reader, path, onboarding, and assessment states. Radius usage spans multiple undocumented arbitrary values, and `modules/courses/CatalogueCard.tsx` is an alternate unused card vocabulary.

Recommendation: centralize semantic student tokens (`canvas`, `surface`, `ink`, `muted`, `border`, `brand`, `brand-soft`, `attention`, `info`, `success`, `danger`) and aliases for 12/20/32/36/pill. Retire or make the alternate card implementation canonical before adding new variants.

### P2 — The lesson reader flattens the route hierarchy

`modules/courses/CourseLessonPageModule.tsx:135-160` overrides the shared main area to white while stacking additional white reading sections (`:254-289, :324-361`). Materi catalogue/path keep the documented pale canvas behind white cards. The reader therefore reads as a separate product surface rather than the next step of the same journey.

Recommendation: keep the canvas behind the route and reserve white/paper panels for the actual reading surface, using the standard soft border and ambient lift.

## Cross-page style matrix

| Surface | Current visual contract | Assessment |
| --- | --- | --- |
| Shared shell / Settings / Notifications | Canvas, white cards, green nav, soft borders | Canonical foundation; unread and action states need semantics. |
| Dashboard | Same palette but mostly flat white, shadowless analytics cards | Cohesive colors, weaker voyage depth and hierarchy. |
| Materi | White/paper catalogue rows, mint icon blocks, green progress/actions | Best reference surface. |
| Kuis | Mint subject cards, dark rail/icon/action, white code pill | Attractive but a different catalogue species. |
| Tryout | White cards with art and green/amber/sky state badges | Useful state differentiation; needs semantic status tokens. |
| Vera AI | Custom two-pane workspace using many shared tokens | Purposeful exception; should inherit shared status/focus/orientation rules. |
| Onboarding | Cyan/lime/slate/yellow | Largest brand fork. |
| Quiz/Tryout attempt/result | Immersive white/gray surfaces, yellow timer/attention, red errors | Purposeful focus mode, but no shared assessment contract. |

## Cognitive load and emotional journey

The main cognitive-load failure is not card count; it is re-learning visual meaning. Grouping and scanability pass within individual routes, but badge semantics, selected/unread/progress colors, radii, and action placement vary enough to increase working memory. Dashboard also presents nine quick-access destinations, adding choice density after the user has already learned the sidebar.

Emotionally, the shared green shell and Materi path create a warm, forward-moving voyage. Kuis’ dark subject cards feel more forceful, Tryout status colors feel operational, and onboarding’s cyan/yellow opening feels like a different brand. Dark immersive assessment screens communicate focus appropriately; they need a small shared Vecalss orientation cue so focus does not become disorientation.

## Personas and accessibility red flags

- **Jordan, first-run student:** onboarding’s palette fork, low-contrast skip text, and unlabeled progress make the first step harder to orient.
- **Sam, keyboard/screen-reader student:** unread dots, onboarding progress/selection, quiz utility state, and dashboard charts rely too heavily on visual styling; quiz exit confirmation does not work.
- **Casey, mobile student:** standard shell behavior is promising, but route-specific full-screen modes change navigation/orientation and need a consistent back/exit affordance.

## Minor observations

- Mixed icon libraries (`@phosphor-icons/react` versus the shared icon module) can create optical-weight drift.
- Dashboard charts use undocumented colors (`DashboardPageModule.tsx:121,128`); use chart semantic tokens and a text summary for zero/empty states.
- The unread dot in notifications is color-only (`NotificationsPageModule.tsx:61-63`); add an explicit state label.
- Standalone quiz and tryout results should share success/danger/warm-accent and orientation tokens even if their layouts remain immersive.

## Questions for the next pass

1. Which catalogue direction should be canonical: Materi’s white + mint icon row, Kuis’ pale-mint + dark-edge card, or one shared geometry with content-specific art blocks?
2. Should “accent” remain a green emphasis token, or should the name be reserved for the warm-sun attention color?
3. Should the next implementation pass unify only badges/tokens first, or also normalize catalogue card geometry and onboarding/assessment mode contracts?

## Settled direction for the next pass

- Use shared card geometry with explicit content variants across Materi, Kuis, and Tryout.
- Reserve `accent` for warm-sun attention; use named semantic tokens for green brand emphasis and other statuses.
- Start with tokens and badges before changing card layouts or onboarding/assessment modes.
