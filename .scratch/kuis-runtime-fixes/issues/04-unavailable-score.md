# 04: Distinguish unavailable scores from released zero

**What to build:** Voyager can distinguish a score that has not been released, a hidden or unscored result, and a genuine released zero. If an earlier released aggregate exists while the current attempt is hidden, the page identifies it separately instead of showing it as the current attempt's score.

**Blocked by:** None.

**Status:** complete — implemented and verified on current `dev`

- [x] Pending, never-released, and review-required results show explicit unavailable states; current score and correct count are never coerced from null to numeric zero.
- [x] A genuine released zero remains visible and distinguishable from an unavailable score. Available positive scores retain their numeric formatting.
- [x] A hidden current attempt remains explicitly hidden. Any earlier released aggregate is shown separately with its scope identified and is not labeled as the current attempt's result. Released current zero/positive scores do not repeat in the aggregate panel.
- [x] Answered count remains accurate. Correct-answer and explanation visibility keep their independent disclosure rules.
- [x] Shared numeric result callers retain their existing behavior. Protected values are not exposed through hidden markup, props, accessible labels, or placeholders.
- [x] Registered rendered/accessibility tests cover pending, never, review-required, released zero, released positive, a hidden attempt with an earlier released aggregate, and unaffected numeric callers.

**Verification:** Run the scoring-release and shared result-presentation contracts, plus the repository verification gate. Test visible text and accessible labels; JSX source regex alone is insufficient.

**Planning source:** Approved ticket artifact `kuis-runtime-fix-tickets/tickets/04-unavailable-score` in epic `788a92f9-1c5a-4fc5-b873-76ac11c9949c`.

## Implementation and verification — 2026-10-10

Integrated the reviewed KRF-04 implementation on `dev`. Current score/count presentation now preserves unavailable states and genuine zero; a prior aggregate is shown only when the current score is unavailable. The quiz result restart controller and server projection/redaction remain unchanged. Registered database-to-render contracts exercise the real sanitized loader and view.

Verification passed:

- `pnpm test:quiz-result-contract` on integrated `dev`: DB projection and rendered presentation contracts passed, including unavailable states, released zero/positive, aggregate scope, disclosure rules, ownership and route scoping, and shared numeric result behavior.
- `pnpm lint`: passed with two existing warnings (`KaptenSettingsPageModule` unused `Badge`; duration UI test unused `deadlineRequests`).
- `pnpm exec tsc --noEmit --pretty false` on the shared `dev` checkout: passed.
- `pnpm verify` in an isolated worktree: passed, including Prisma generation, lint, optimized production build and type validation. The shared checkout's current `KaptenMateriBuilderPageModule.tsx` was copied into that temporary verification worktree to include its existing `parentHref` correction; the shared source and running app server were not changed by the build.

No browser review was run. The current change was checked by independent Standards and Spec reviews; both report no unresolved findings. The Spec review's aggregate-scope issue is fixed and the corrected renderer assertions passed. Older structural-suite failures noted in the implementation evidence were not part of the `verify` gate and were not weakened.

Implementation evidence: `artifacts/krf04-implementation-evidence` in epic `788a92f9-1c5a-4fc5-b873-76ac11c9949c`.
