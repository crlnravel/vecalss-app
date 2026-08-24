---
target: Tryout authoring UX boundary review
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-08-23T04-15-55Z
slug: modules-mentor-kaptentryoutbuilderpagemodule-tsx
---
---
title: "Tryout and Kuis authoring UX boundary review"
kind: review
---

Method: dual-agent Impeccable critique (Assessment A: ae195118-759f-4ddf-88c8-d5db2208bf6b · Assessment B: 4e3fecfa-ab05-4d81-8390-99983378d44b), coordinator source verification, and authenticated ego-browser desktop evidence. Mobile QA was intentionally skipped per the current handoff.

## Verdict

The visual direction is a conditional pass: Vecalss has a coherent, calm authoring language, no P0 issue was found, and the static detector is clean. Changes are required before the creator experience feels clear and trustworthy, especially around the boundary between authoring concepts and implementation concepts.

The highest-impact correction is progressive disclosure. A new creator should see a short build flow—Basics, Sections, Questions, Rules, Review, Publish. Schedule, Live, Attempts, and Results should appear after the first save, with a plain explanation that those areas manage an already-created assessment. The creator should see “Rilis Tryout” and “salinan konten terkunci,” not AssessmentRelease, snapshot immutable, server checks, or 2PL as primary UI language.

## Design Health Score

Tryout: 24/40 (acceptable, significant improvement needed). Kuis: 25/40 (acceptable, significant improvement needed).

| # | Heuristic | Tryout | Kuis | Key issue |
|---|---|---:|---:|---|
| 1 | Visibility of system status | 3/4 | 3/4 | Tryout exposes state, but the normal empty draft is framed by release language; Kuis says Tersimpan before the first save. |
| 2 | Match between system and real world | 2/4 | 3/4 | Indonesian PTN context is strong, but AssessmentRelease, assembly, delivery, Ready, and mixed English terms leak through. |
| 3 | User control and freedom | 2/4 | 2/4 | Source-mode changes can clear work; local question removal has no undo. |
| 4 | Consistency and standards | 2/4 | 3/4 | Tryout mixes build and operations; Kuis mixes Kuis, Quiz, Questions, and Question Bank. |
| 5 | Error prevention | 2/4 | 3/4 | Review gates help, but publish reasons are distant and source changes are destructive without confirmation. |
| 6 | Recognition rather than recall | 3/4 | 2/4 | Counters and summaries help; important next steps and source consequences are not always adjacent. |
| 7 | Flexibility and efficiency | 2/4 | 2/4 | Direct selection is repetitive; seven sections and multiple source decisions require repeated work. |
| 8 | Aesthetic and minimalist design | 3/4 | 3/4 | Calm, authored desktop surfaces; Tryout carries too much navigation chrome before save. |
| 9 | Error recovery | 2/4 | 2/4 | Review links are useful, but there is no undo for source changes and several errors lack a nearby fix. |
| 10 | Help and documentation | 2/4 | 2/4 | Inline descriptions exist, but technical terms and mode decisions are not taught in creator language. |

## Design-specificity verdict

The surfaces feel authored for Vecalss rather than copied from a generic CRUD dashboard. The sea-glass palette, voyage-green actions, PTN subtest sequence, seven-section Tryout scaffold, readiness counters, and release confirmation all express a real assessment product.

The missed opportunity is conceptual specificity. The UI currently mirrors internal data structures more than a Kapten’s mental model. “AssessmentRelease,” “assembly,” “delivery,” “snapshot immutable,” “ParticipantView,” “server checks,” and “2PL” describe the implementation boundary. They do not describe the creator’s outcome. Kuis is visually coherent but structurally close to a generic content form; its product identity is carried mostly by Bank Soal and PTN labels.

The deterministic static detector returned an empty result for the four markup targets. The live browser detector found 11 grouped observations on Tryout and 9 on Kuis. Most were intentional or shared-shell false positives: Plus Jakarta Sans is the documented brand font; sidebar transitions and shell/header/workspace nested-card reports describe shared structure; the Tryout kicker and large form panel are deliberate. The actionable detector observation is the Tryout release notice: its copy is long and rendered at approximately 11.25px, making a technical message harder to scan.

## Overall impression

The foundation is trustworthy but asks creators to understand too much of the system before they can simply make an assessment. The single biggest opportunity is to turn the workspace into a guided authoring journey: choose content, review plain-language readiness, publish a named release, then manage delivery and results.

## What is working

1. The Tryout scaffold is meaningfully domain-specific. PU → PPU → PBM → PK → LBI → LBE → PM, section counters, rules, and review checks make a complicated assessment model recognizable.
2. The save-versus-publish boundary is a strong trust pattern. Locked published content, duplication, confirmation, and participant-release messaging protect assessment history.
3. The desktop craft is calm and consistent. Sea-glass surfaces, deep-green actions, rounded cards, clear labels, and readable form hierarchy fit a Kapten authoring workspace.

## Priority issues

### [P1] Internal release and assembly terminology is visible in the creator path

Evidence includes AssessmentRelease labels and descriptions in the Tryout builder around 1276–1286, “Sesi delivery” around 1223, “Rules per Section” and “kalibrasi 2PL” around 1191, and Review copy such as readiness, blocker, eligible, server checks, duplicate question, and snapshot AssessmentRelease around 1264–1267. Kuis’s persisted binding card exposes “Assembly terpasang,” “Mode,” “Rilis,” and “Bank.”

Why it matters: a Kapten needs to decide what participants will experience, not reason about release aggregates, immutable snapshots, or calibration provenance. Technical vocabulary makes the product feel like an engineering console and obscures the next action.

Fix: use a creator-language boundary:
- AssessmentRelease → Versi rilis Tryout, with one explanation: “Versi konten yang dikunci untuk sesi peserta.”
- assembly → Sumber soal or Paket soal.
- Ready → Siap digunakan.
- blocker → Perlu diperbaiki.
- eligible → Tersedia.
- server checks → Pemeriksaan otomatis saat diterbitkan.
- snapshot immutable → Salinan konten terkunci.
- delivery → Sesi pelaksanaan.
- ParticipantView → Status peserta.
- 2PL → hide from primary UI; say “Kesiapan CAT” and put technical details behind optional help.
- Assembly terpasang → Sumber soal terpasang; Lepaskan assembly → Gunakan soal satu per satu.

Keep CAT, CBT, Bank Soal, and the seven subtest names because they are meaningful domain terms, but define them by outcome.

Suggested command: $impeccable clarify

### [P1] Build, publish, delivery, and monitoring are presented as one peer-level navigation

Evidence: Tryout exposes ten workspace destinations before a new Tryout has an ID. Schedule & akses, Live, Attempts, and Results render “Simpan draf untuk membuka ruang ini,” which feels like a dead end. The create route therefore makes five operational destinations compete with the four build steps and two publish steps.

Why it matters: first-time creators see a large system map instead of a next step. It increases cognitive load and makes a normal new draft feel broken.

Fix: use progressive disclosure:
- Build: Basics, Sections, Questions, Rules.
- Publish: Review, Publish.
- After first save: Schedule & akses.
- After sessions exist: Live, Attempts, Results.
On create, show a quiet locked summary: “Simpan draf terlebih dahulu untuk mengatur jadwal, peserta, dan hasil.” Keep one clear action to save. Make “Ke Publish” a single route into Review/Publish rather than a competing duplicate.

Suggested command: $impeccable distill

### [P1] Save and publish status is not trustworthy at the action point

Evidence: Kuis reports “Tersimpan” on a new unsaved create state. Its Terbitkan button is disabled while the reason is placed in Pengaturan. Tryout’s publish blockers appear below the primary action area, after the creator has already reached the high-stakes step.

Why it matters: contradictory status and distant reasons force the creator to guess whether to save, choose a Bank Soal, or configure settings.

Fix: use “Belum disimpan” or “Draf lokal” before the first save; show “Draf tersimpan” after save. Put a compact readiness summary beside Terbitkan with direct links: “Pilih Bank Soal,” “Tambahkan soal,” or “Lengkapi pengaturan.” Keep the disabled state only when its reason is visible beside it.

Suggested command: $impeccable clarify

### [P1] Source-mode changes can silently discard creator work

Evidence: chooseSelectionMode clears directQuestions when switching to a non-direct mode and clears the attached package when switching back. There is no confirmation or undo.

Why it matters: a creator can select many questions, switch modes to inspect another option, and lose work without realizing it.

Fix: preserve a draft per mode, or confirm with the exact consequence: “Beralih ke Pool akan melepas 12 soal langsung dari PU.” Offer Batal, Simpan untuk nanti, and Lanjutkan. Add undo for question removal.

Suggested command: $impeccable harden

### [P2] Source choice needs an outcome-based decision aid

The Questions surface asks creators to choose Direct, Set Ready, Pool, Blueprint, or CAT Pool while also showing readiness and technical validation language.

Fix: make each option describe the result:
- Pilih langsung — Pilih soal satu per satu.
- Set soal — Gunakan paket soal yang sudah disiapkan.
- Pool acak — Ambil beberapa soal dari kumpulan kandidat.
- Blueprint — Tentukan jumlah soal mudah, sedang, dan sulit.
- CAT — Gunakan soal adaptif yang sudah diperiksa.
Move detailed readiness explanation into the selected panel, not the initial choice row.

Suggested command: $impeccable clarify

### [P2] Kuis’s persisted assembly panel is still too technical

New direct creation correctly hides the assembly picker, but an existing bound Kuis can still expose technical language such as Mode, Rilis, and assembly identity.

Fix: present the state as “Sumber soal terpasang,” show the human-readable source and version label, and explain the consequence of detaching: “Setelah dilepas, Anda dapat memilih soal satu per satu.” Keep the identity/digest in an expandable “Detail sumber” section only when needed for support or audit.

Suggested command: $impeccable clarify

### [P2] Small, long release copy competes with authoring

The live detector found a long, approximately 11.25px Tryout release notice. The notice also appears on a normal draft, where it reads like an error.

Fix: make the initial state neutral: “Belum ada versi rilis—terbitkan Tryout saat soal dan aturan siap.” Use one or two readable lines, link to Review, and reserve amber styling for an actionable warning.

Suggested command: $impeccable typeset

### [P2] Review blockers are descriptive but not always actionable

Review names blockers such as CAT calibration, duplicate questions, source readiness, and mode/test mismatch, but the creator must infer which control fixes them.

Fix: translate every blocker into a verb-led action and place it next to the primary action:
- “Periksa soal”
- “Atur jumlah soal CAT”
- “Pilih sumber CBT/CAT yang sesuai”
- “Buka Questions”
- “Lengkapi PU”
Do not show “duplicate question” or “server checks” as standalone implementation messages.

Suggested command: $impeccable clarify

## Mentor/student boundary

The mentor is the author and publisher. The student is the participant. Keep the following out of student-facing surfaces entirely: AssessmentRelease, assembly mode, source readiness, CAT calibration, 2PL, digest, provenance, immutable snapshots, internal IDs, and audit terminology.

Student-facing language should be limited to: invitation, schedule, waiting room, instructions, questions, progress, submission, and released results. Mentor-only views may expose more detail, but the primary UI should still lead with human outcomes. The student should never need to know that an attempt is bound to a release aggregate or that a CAT item carries calibration provenance.

## Persona red flags

### Jordan — first-time Kapten

- Sees ten Tryout tabs before the first save and clicks into operational tabs that only say save first.
- Encounters AssessmentRelease, assembly, server checks, and snapshot language without a glossary.
- Sees Kuis “Tersimpan” on a new draft and a disabled Terbitkan without the reason beside it.
- Reaches an empty source state without a direct “Buka Bank Soal” or “Coba bank lain” recovery action.

### Alex — experienced Kapten

- Must repeat source decisions across seven sections and add direct questions one at a time.
- Cannot safely compare source modes because switching can discard current work.
- Gets little efficiency from the parallel operational tabs before a Tryout is saved.

### Sam — keyboard, screen-reader, or low-vision user

- Ten tabs create a long keyboard path before the actual form.
- Technical, long release notices are small and difficult to scan or announce.
- Async source loading and empty states do not always communicate whether content is loading, unavailable, or filtered.
- Icon-only Kuis actions are named, but visible text would improve recognition for low-vision users.

## Minor observations

- The Tryout kicker “Tryout workspace” is useful context but can be shortened to “Membuat Tryout” on create.
- “Buat Quiz” and “Kuis” should use one product term.
- “Pilih Questions” and “Question Bank” should become “Pilih soal” and “Bank Soal.”
- Name the default seven-section scaffold, for example “Preset UTBK standar.”
- Keep the participant preview clearly labeled as a summary until it shows the actual question experience.
- Put a visible “Buka Bank Soal” action in zero-result source states.
- Preserve the good review jump links and extend them to the publish summary.
- The static detector’s Plus Jakarta Sans and shared-shell warnings are not reasons to change the design system.

## Questions to consider

- What if the first Tryout screen showed only the six creator steps and revealed operations after saving?
- Should each source mode retain a draft so creators can compare options without losing questions?
- Can every publish blocker be written as a verb-led action beside Terbitkan?
- Should technical source details be placed in an expandable “Detail sumber” section rather than the main card?
- What would a confident first 60 seconds look like: title, one source, one previewed question, save, then review?
