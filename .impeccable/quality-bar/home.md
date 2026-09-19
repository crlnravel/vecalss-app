# Home landing quality bar

Reference: `original-f0bde744caba8b9b04b7bc81e600350c.mp4`

SHA-256: `5ff2c6fb5f58f9e084987d0328cfeb481c6c6da4fa735559d7e8ad03b176571d`

- Preserve the reference's compact floating navigation, connected visual hero, human orbits, varied program composition, five-step fan choreography, staged testimonials, and oversized footer wordmark.
- Run every story beat full width on one uninterrupted pale Harbor Canvas. Sections have no outer gutter, independent fill, border, radius, shadow, frame, or visible seam; whitespace and composition establish the reading rhythm.
- Place decorative art, campus marks, intrinsic photo crops, program offerings, learning steps, and testimonial quote groups directly on the background. Do not add backing cards, art wells, filled tiles, or closed border boxes.
- Structure programs with one shared divider grid and Voyage Deep artwork. Keep learning as five free-floating art-and-text groups, testimonials as moving transparent quote groups, hero satellites transparent, and the mascot core outlined rather than filled.
- Keep the first viewport immediately legible at 390px and 1440px without requiring animation; use motion only to reinforce connection and hierarchy.
- Motion thesis: show the complete hero immediately, let its satellites drift subtly, then hand off to the Kapten statement through a rolling wheel of six university marks. The wheel rotates with section scroll while the marks counter-rotate to stay readable. Program offerings lift from below in sequence, the learning stack fans into five groups and exits downward, testimonials shuffle through previous/active/next depth positions, and the oversized footer word rises through a clipped viewport. Section exits remain scroll-linked and move only tens of pixels; ambient motion pauses offscreen and while the page is hidden.
- In-page landing links use smooth scrolling at the document root; `prefers-reduced-motion: reduce` switches scrolling to `auto` and keeps every composition in its final static state.
- Maintain visible keyboard focus, 44px interaction targets, small-copy contrast of at least 4.5:1, reduced-motion compatibility, and a single active testimonial in the accessibility tree.
- Shipping evidence: `.impeccable/review/desktop-continuous.png`, `.impeccable/review/mobile-continuous.png`, `output/playwright/landing-motion-final.webm`, `output/playwright/motion-hero-mentor.png`, `output/playwright/motion-program-learning.png`, `output/playwright/motion-testimonial-shuffle.png`, `output/playwright/motion-footer-rise.png`, and the matching mobile captures, plus lint, TypeScript, diff, and production-build verification.
