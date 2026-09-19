---
version: 1
slug: "modules-home-homepagemodule-tsx"
primary_target: "modules/home/HomePageModule.tsx"
related_targets: ["modules/home/components/marketing-header.tsx","modules/home/components/testimonial-stage.tsx","app/globals.css"]
---

## Direction contract

THESIS: Vecalss is one connected voyage from first lesson to campus arrival, not a stack of disconnected tutoring features.

OWN-WORLD: One uninterrupted pale Harbor Canvas carries every story beat at full width. Voyage marks, real mentors, alumni, campuses, program art, learning steps, testimonial quotes, and the Vecalss mascot sit directly on that background; sections have no outer gutter, fill, border, radius, shadow, or frame.

STORY: Connect the system; meet the Kapten; choose a program; see the learning loop; arrive with alumni; hear proof; resolve questions; begin.

FIRST VIEWPORT: Floating pill navigation above a direct icon-and-portrait network, one transparent outlined mascot core, a concise promise, and one primary action. Satellites have no backing tiles.

FORM: User-pinned video reference, seed `user-reference:original-f0bde744caba8b9b04b7bc81e600350c.mp4`, position 1/1 pinned. Quality bar: `.impeccable/quality-bar/home.md`.

FINISH: SHIP after desktop/mobile review, smooth-anchor and reduced-motion verification, lint, TypeScript, diff, and production build. Evidence: `.impeccable/review/desktop-continuous.png`, `.impeccable/review/mobile-continuous.png`, plus focused captures under `output/playwright/`.

## Motion thesis

FOCAL MOMENT: The complete connected hero is visible immediately, then gently recedes into the Kapten statement and its rolling university-logo wheel; later, the learning stack opens into its five-step fan.

CONTINUITY: Each scene continues its vertical travel while the next enters: the university-logo wheel rotates with scroll and keeps marks upright, portraits settle at varied heights and drift outward on exit, program offerings lift from below, the fan leaves downward, transparent testimonial groups shuffle in depth, and the oversized footer word rises through clipping. Artwork stays Voyage Deep, and every art/text group remains directly on the continuous canvas.

FEEDBACK: Testimonial quote groups move through previous, active, and next positions; CTA and real bordered carousel controls acknowledge hover and press without spectacle. In-page navigation scrolls smoothly to anchored story beats.

BUDGET: One-shot IntersectionObserver entrances combine with a requestAnimationFrame scroll controller that writes CSS variables without React re-renders. Transforms stay within tens of pixels except edge-origin portrait entrances and the deliberately oversized footer word; blur is bounded to 3.5px on scroll handoffs. No new dependency; loops pause offscreen or while hidden, reduced motion keeps the final static hierarchy, and document-root anchor scrolling switches from smooth to auto.
