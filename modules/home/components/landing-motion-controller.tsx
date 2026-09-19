"use client";

import type { LenisOptions } from "lenis";
import { ReactLenis } from "lenis/react";
import { useEffect } from "react";

const landingLenisOptions = {
  anchors: true,
  autoRaf: true,
  lerp: 0.085,
  respectReducedMotion: true,
  smoothWheel: true,
  stopInertiaOnNavigate: true,
  syncTouch: false,
  wheelMultiplier: 0.9,
} satisfies LenisOptions;

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

function LandingMotionController() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing-motion-root]");
    if (!root) return;
    const motionRoot = root;

    const stages = Array.from(motionRoot.querySelectorAll<HTMLElement>("[data-motion-scene]"));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;

    function updateScrollProgress() {
      const viewportHeight = Math.max(window.innerHeight, 1);

      stages.forEach((stage) => {
        const bounds = stage.getBoundingClientRect();
        const progress = clamp((viewportHeight - bounds.top) / (viewportHeight + bounds.height));
        const isHero = stage.dataset.motionScene === "hero";
        const isMentors = stage.dataset.motionScene === "mentors";
        const isPrograms = stage.dataset.motionScene === "programs";
        const isLearning = stage.dataset.motionScene === "learning";
        const isAlumni = stage.dataset.motionScene === "alumni";
        const isFooter = stage.dataset.motionScene === "footer";
        const enter = isHero ? 1 : smoothstep((progress - 0.02) / 0.34);
        const exitStart = isHero ? 0.53 : 0.66;
        const exit = isFooter ? 0 : smoothstep((progress - exitStart) / (1 - exitStart));
        const exitDistance = isLearning ? 54 : -44;

        stage.style.setProperty("--scene-progress", progress.toFixed(4));
        stage.style.setProperty("--scene-enter", enter.toFixed(4));
        stage.style.setProperty("--scene-exit", exit.toFixed(4));
        stage.style.setProperty("--scene-exit-y", `${(exit * exitDistance).toFixed(2)}px`);
        stage.style.setProperty("--scene-exit-scale", (1 - exit * 0.035).toFixed(4));
        stage.style.setProperty("--scene-exit-opacity", (1 - exit * 0.72).toFixed(4));
        stage.style.setProperty("--scene-exit-blur", `${(exit * 3.5).toFixed(2)}px`);
        stage.style.setProperty("--scene-exit-nudge", `${(exit * 28).toFixed(2)}px`);

        if (isMentors) {
          const orbitDistance = Math.max(bounds.height - viewportHeight, 1);
          const orbitProgress = smoothstep(-bounds.top / orbitDistance);
          const orbitRotation = orbitProgress * 360;

          stage.style.setProperty("--university-orbit-progress", orbitProgress.toFixed(4));
          stage.style.setProperty("--university-orbit-left", `${orbitRotation.toFixed(2)}deg`);
          stage.style.setProperty("--university-orbit-left-counter", `${(-orbitRotation).toFixed(2)}deg`);
          stage.style.setProperty("--university-orbit-right", `${(-orbitRotation).toFixed(2)}deg`);
          stage.style.setProperty("--university-orbit-right-counter", `${orbitRotation.toFixed(2)}deg`);
        }

        if (isPrograms) {
          const rawProgramProgress = clamp((viewportHeight - bounds.top) / (viewportHeight * 0.82));
          const headingProgress = smoothstep(rawProgramProgress);
          const headingInverse = 1 - headingProgress;

          stage.style.setProperty("--program-heading-y", `${(headingInverse * 72).toFixed(2)}px`);
          stage.style.setProperty("--program-heading-opacity", headingProgress.toFixed(4));
          stage.style.setProperty("--program-heading-blur", `${(headingInverse * 9).toFixed(2)}px`);

          stage.querySelectorAll<HTMLElement>(".motion-program-card").forEach((card, index) => {
            const cardProgress = smoothstep((rawProgramProgress - index * 0.055) / 0.72);
            const cardInverse = 1 - cardProgress;

            card.style.setProperty("--program-card-y", `${(cardInverse * 132).toFixed(2)}px`);
            card.style.setProperty("--program-card-opacity", cardProgress.toFixed(4));
            card.style.setProperty("--program-card-blur", `${(cardInverse * 8).toFixed(2)}px`);
            card.style.setProperty("--program-card-scale", (0.965 + cardProgress * 0.035).toFixed(4));
          });
        }

        if (isAlumni) {
          const rawAlumniProgress = clamp(
            (viewportHeight * 0.92 - bounds.top) / (viewportHeight * 0.72),
          );

          stage.querySelectorAll<HTMLElement>("[data-alumni-card]").forEach((card, index) => {
            const alumniProgress = smoothstep(
              (rawAlumniProgress - index * 0.018) / 0.91,
            );
            const alumniInverse = 1 - alumniProgress;
            const x = Number(card.dataset.alumniX ?? 0);
            const y = Number(card.dataset.alumniY ?? 0);
            const rotation = Number(card.dataset.alumniRotate ?? 0);

            card.style.setProperty("--alumni-scroll-x", `${(x * alumniInverse).toFixed(2)}px`);
            card.style.setProperty("--alumni-scroll-y", `${(y * alumniInverse).toFixed(2)}px`);
            card.style.setProperty("--alumni-scroll-rotate", `${(rotation * alumniInverse).toFixed(2)}deg`);
            card.style.setProperty("--alumni-scroll-scale", (0.78 + alumniProgress * 0.22).toFixed(4));
            card.style.setProperty("--alumni-scroll-opacity", alumniProgress.toFixed(4));
            card.style.setProperty("--alumni-scroll-blur", `${(alumniInverse * 10).toFixed(2)}px`);
          });
        }

      });
    }

    function queueScrollUpdate() {
      if (animationFrame) return;

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateScrollProgress();
      });
    }

    function updatePageVisibility() {
      motionRoot.dataset.pageVisible = document.hidden ? "false" : "true";
    }

    updatePageVisibility();
    document.addEventListener("visibilitychange", updatePageVisibility);

    if (reduceMotion.matches) {
      motionRoot.dataset.motionReady = "reduced";
      motionRoot.dataset.scrollMotion = "reduced";
      stages.forEach((stage) => {
        stage.dataset.motionRevealed = "true";
        stage.dataset.motionInview = "true";
        if (stage.dataset.motionScene === "mentors") {
          stage.style.setProperty("--university-orbit-progress", "1");
          stage.style.setProperty("--university-orbit-left", "0deg");
          stage.style.setProperty("--university-orbit-left-counter", "0deg");
          stage.style.setProperty("--university-orbit-right", "0deg");
          stage.style.setProperty("--university-orbit-right-counter", "0deg");
        }
      });

      return () => document.removeEventListener("visibilitychange", updatePageVisibility);
    }

    const initiallyVisible = stages.filter((stage) => {
      const bounds = stage.getBoundingClientRect();
      return bounds.top < window.innerHeight * 0.92 && bounds.bottom > window.innerHeight * 0.08;
    });

    motionRoot.dataset.motionReady = "true";
    updateScrollProgress();
    motionRoot.dataset.scrollMotion = "true";
    window.addEventListener("scroll", queueScrollUpdate, { passive: true });
    window.addEventListener("resize", queueScrollUpdate);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const stage = entry.target as HTMLElement;
          stage.dataset.motionInview = entry.isIntersecting ? "true" : "false";

          if (entry.isIntersecting) {
            stage.dataset.motionRevealed = "true";
          }
        });
      },
      { rootMargin: "-8% 0px -8%", threshold: 0.14 },
    );

    // Give the first painted frame a short hold so the authored hero entrance is
    // actually visible instead of completing during hydration and image decode.
    const revealTimer = window.setTimeout(() => {
      initiallyVisible.forEach((stage) => {
        stage.dataset.motionRevealed = "true";
        stage.dataset.motionInview = "true";
      });

      stages.forEach((stage) => observer.observe(stage));
    }, 160);

    return () => {
      window.clearTimeout(revealTimer);
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", updatePageVisibility);
      window.removeEventListener("scroll", queueScrollUpdate);
      window.removeEventListener("resize", queueScrollUpdate);
    };
  }, []);

  return <ReactLenis options={landingLenisOptions} root />;
}

export { LandingMotionController };
