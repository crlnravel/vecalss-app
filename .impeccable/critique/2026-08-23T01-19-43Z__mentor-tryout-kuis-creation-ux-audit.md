---
target: mentor tryout kuis creation UX audit
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 7
timestamp: 2026-08-23T01-19-43Z
slug: mentor-tryout-kuis-creation-ux-audit
---
# Impeccable UX audit: Tryout and Kuis creation

Verdict: Acceptable, but not ready for a polished authoring release.

## Scope

Tryout and Kuis create/edit/catalogue routes, builder modules, route shell wiring, shared dialog/tabs/dropdown primitives, release labels, and desktop/mobile behavior.

## Findings

- P1: Tryout create/edit has no dirty-navigation guard; browser repro loses a typed title when navigating to the dashboard. Kuis has the expected confirmation dialog.
- P1: Tryout’s ten-tab rail mixes authoring with Live/Attempts/Results, which are dead ends until the first save.
- P1: Tryout Bank Soal picker label is not associated with its trigger: the label has no `htmlFor` and the trigger has no stable id.
- P1: Tryout and Kuis catalogue routes expose duplicate `<main>` landmarks because SidebarInset and the shell content element are both native main elements.
- P1: Tryout participant-preview and duplicate-confirmation dialogs leak keyboard focus to the page behind them.
- P1: Tryout Questions content clips at 320px in a hidden horizontal scroll area.
- P1: Inactive Tryout tab labels measure approximately 4.20:1 against the tab rail, below normal-text AA.
- P2: Tryout Bank Soal popover dialog is unnamed; shell search is inert beside route-specific search; secondary-500 metadata is approximately 3.12:1 on white; important mobile controls are below the project’s 44px target.
- P2: Kuis Ready assembly dropdown is acceptable at current scale but should become a searchable named picker as release counts grow.
- P3: Mixed English/Indonesian copy, “Simpan draft”/“Simpan draf,” and route-specific hex colors reduce consistency.

## Strengths

Kuis’s three-tab split is clear, its dirty-state guard works, its assembly picker explains the one Bank/Subtest boundary and uses friendly `Rilis N` labels, and both create surfaces have no page-level overflow at 390px. Tryout’s seven-section model, review/publish messaging, and mobile tab scroll cue are strong. The Impeccable detector returned `[]` for targeted markup.

## Recommended order

1. Guard Tryout edits and contain dialog focus.
2. Split Tryout authoring from post-save operations.
3. Fix picker label/combobox semantics and 320px wrapping.
4. Establish one catalogue `<main>` owner.
5. Normalize tokens, contrast, shell search, touch targets, and copy.
