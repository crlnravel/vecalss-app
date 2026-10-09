# 04: Distinguish unavailable scores from released zero

**What to build:** Voyager can distinguish a score that has not been released, a hidden or unscored result, and a genuine released zero. If an earlier released aggregate exists while the current attempt is hidden, the page identifies it separately instead of showing it as the current attempt's score.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Pending, never-released, and review-required results show explicit unavailable states; current score and correct count are never coerced from null to numeric zero.
- [ ] A genuine released zero remains visible and distinguishable from an unavailable score. Available positive scores retain their numeric formatting.
- [ ] A hidden current attempt remains explicitly hidden. Any earlier released aggregate is shown separately with its scope identified and is not labeled as the current attempt's result.
- [ ] Answered count remains accurate. Correct-answer and explanation visibility keep their independent disclosure rules.
- [ ] Shared numeric result callers retain their existing behavior. Protected values are not exposed through hidden markup, props, accessible labels, or placeholders.
- [ ] Registered rendered/accessibility tests cover pending, never, review-required, released zero, released positive, a hidden attempt with an earlier released aggregate, and unaffected numeric callers.

**Verification:** Run the scoring-release and shared result-presentation contracts, plus the repository verification gate. Test visible text and accessible labels; JSX source regex alone is insufficient.

**Planning source:** Approved ticket artifact `kuis-runtime-fix-tickets/tickets/04-unavailable-score` in epic `788a92f9-1c5a-4fc5-b873-76ac11c9949c`.
