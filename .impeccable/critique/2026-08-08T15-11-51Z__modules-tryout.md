---
target: tryout system
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-08-08T15-11-51Z
slug: modules-tryout
---
Method: dual-agent (A: `/root/tryout_review_a2` · B: `/root/tryout_detector_review`)

## Design Health Score

The independent source review scored the original participant journey **24/40 (Acceptable)**. After remediation, the same rubric scores the current implementation **30/40 (Good)**; the post-fix score is source- and contract-verified because browser rendering was unavailable.

| # | Heuristic | Before | After | Key outcome |
|---|---|---:|---:|---|
| 1 | Visibility of System Status | 2 | 3 | Autosave is visible on mobile, catalogue time states refresh, and admission/session states are explicit. |
| 2 | Match System / Real World | 3 | 3 | Indonesian exam language is strong; WIB and CBT/CAT behavior are now explicit at the decision point. |
| 3 | User Control and Freedom | 3 | 3 | Back, edit, review, and irreversible-submit confirmation remain clear. |
| 4 | Consistency and Standards | 3 | 3 | The participant journey remains cohesive across catalogue, exam, and result surfaces. |
| 5 | Error Prevention | 2 | 3 | Invitation-only and missing-session states are blocked before false progress; registration is transactionally safe. |
| 6 | Recognition Rather Than Recall | 2 | 3 | Question position restores after interruption and the current save state stays visible. |
| 7 | Flexibility and Efficiency | 2 | 3 | Search recovery and direct weak-subtest learning links shorten repeat use. |
| 8 | Aesthetic and Minimalist Design | 3 | 3 | The calm Vecalss visual system and focused attempt shell are preserved. |
| 9 | Error Recovery | 2 | 3 | Empty search, unavailable registration, and failed saves now provide a concrete recovery action. |
| 10 | Help and Documentation | 2 | 3 | Integrity monitoring, timer behavior, score meaning, and session timezone are explained in context. |
| **Total** |  | **24/40** | **30/40** | **Acceptable → Good** |

## Design Specificity Verdict

The system is recognizably Vecalss: voyage green, PTN target selection, Indonesian exam language, and the result framing as a learning map give the experience product character. The attempt shell appropriately becomes calmer and more conventional under exam pressure. The result journey is now more specific because each weak subtest links to its own Materi route rather than a broken generic `/materi` destination.

The deterministic scan found **0 findings across 6 scannable tryout component files** before remediation and again after the edits. This confirms the issues were semantic UX and state-model problems, not detector-level visual anti-patterns.

No visual overlay is available: the browser runtime exposed no browser instances (`agent.browsers.list()` returned `[]`), so mutable injection and responsive screenshots could not be performed.

## Overall Impression

The foundation was visually strong but under-explained at the exact moments where a timed assessment needs maximum trust. The biggest opportunity was not a redesign; it was making server state, monitoring, recovery, and the post-result learning path tell the truth clearly. That work is now implemented.

## What's Working

1. Registration, confirmation, rules, answer saving, unanswered-count confirmation, and locked sections form a coherent high-stakes safety narrative.
2. Results turn performance into reflection through accuracy, time, ranking state, weak subtests, and answer explanations.
3. The current code preserves role and attempt invariants while adding clearer student-facing state rather than weakening the operational model.

## Priority Issues

### [P1 · Fixed] Admission status could promise a room that did not exist

An approved Voyager without a delivery assignment saw “Masuk ruang tunggu,” then returned to detail without explanation. The UI now distinguishes approval from session assignment, invitation-only access is blocked at the route, and registration redirects only when an assignment exists.

### [P1 · Fixed] Timed-session trust signals were incomplete

All schedules now label WIB. The waiting room discloses focus/tab/fullscreen logging before consent and explicitly states that integrity events do not automatically reduce a score.

### [P1 · Fixed] Mobile hid the autosave reassurance promised by the rules

The save state is now visible at every breakpoint, includes a recovery instruction on failure, and the urgent timer has a textual cue in addition to color.

### [P2 · Fixed] Interruption recovery restored answers but not orientation

CBT now persists the last viewed item and restores the Voyager to that question with a confirmation that server answers were recovered.

### [P1 · Open] Final-score aggregation needs a declared cross-model formula

The backend currently adds CBT point totals and CAT 2PL ability estimates into one `finalScore`. The durable PRD requires per-Test scoring followed by aggregation, but does not define a normalization or weighting formula. The UI now truthfully calls this an internal Vecalss index and disclaims official SNBT equivalence; changing the calculation itself would invent assessment policy and remains open.

Suggested command: `$impeccable harden` after the scoring policy is settled.

## Persona Red Flags

**Jordan (first-timer):** The previous unexplained CBT/CAT and monitoring behavior is addressed in the waiting-room rules. Result scoring is less misleading, but the exact internal aggregation formula still needs product documentation.

**Sam (accessibility-dependent):** Autosave is no longer removed from the mobile accessibility tree, urgency is not color-only at supported header widths, and answer-review summaries have a visible keyboard focus ring. A real screen-reader and 200% zoom pass remains unverified without browser access.

**Casey (distracted mobile user):** Returning to an active CBT section now restores the last question, save status remains visible, and failed saves say how to retry. A manual thumb-zone review on a physical phone remains worthwhile.

## Minor Observations

- Catalogue cards still share one placeholder banner, which limits visual recognition.
- Very large catalogues and long CBT palettes have no pagination or grouping strategy.
- The result loading state still presents illustrative processing stages rather than measured backend phases.
- Score calibration and aggregation should be documented before the internal index is used outside same-session comparison.

## Questions to Consider

1. Which normalized and weighted formula should combine CBT points with CAT ability estimates into the declared final score?
2. Can authored tryout banners replace the shared placeholder so repeat Voyagers recognize packages faster?
3. Should very large CBT sections group the question palette by blocks to keep decision density manageable?
