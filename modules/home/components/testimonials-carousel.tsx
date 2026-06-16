"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { testimonials } from "../data";
import { NavigationDots } from "./home-primitives";
import { TestimonialCard } from "./testimonial-card";

const AUTOPLAY_INTERVAL_MS = 6000;

function getWrappedIndex(index: number, total: number) {
  return (index + total) % total;
}

function TestimonialsCarousel() {
  const total = testimonials.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const rotateBy = (delta: number) => {
    setActiveIndex((currentIndex) => getWrappedIndex(currentIndex + delta, total));
  };

  const jumpTo = (index: number) => {
    setActiveIndex(getWrappedIndex(index, total));
  };

  const autoplayAdvance = useEffectEvent(() => {
    setActiveIndex((currentIndex) => getWrappedIndex(currentIndex + 1, total));
  });

  useEffect(() => {
    if (isPaused || total < 2) {
      return;
    }

    const intervalId = window.setInterval(() => {
      autoplayAdvance();
    }, AUTOPLAY_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPaused, total]);

  const orderedTestimonials = [-1, 0, 1].map((offset) => {
    return {
      position: offset,
      testimonial: testimonials[getWrappedIndex(activeIndex + offset, total)],
    };
  });

  return (
    <div
      className="overflow-hidden rounded-[32px] border border-primary-700 bg-primary-900 px-5 py-8 shadow-[0px_5px_0px_0px_#191a23] md:rounded-[45px] md:px-10 md:py-16"
      onBlur={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="md:hidden">
        <TestimonialCard testimonial={testimonials[activeIndex]} />
      </div>

      <div className="hidden md:flex md:flex-col md:gap-14">
        <div className="grid items-end gap-6 md:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)_minmax(0,0.78fr)]">
          {orderedTestimonials.map(({ position, testimonial }) => (
            <TestimonialCard
              key={`${testimonial.name}-${position}`}
              className={
                position === 0
                  ? "translate-y-0"
                  : position < 0
                    ? "translate-y-8 -translate-x-5"
                    : "translate-y-8 translate-x-5"
              }
              compact={position !== 0}
              isActive={position === 0}
              testimonial={testimonial}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 text-white md:mt-0 md:justify-center md:gap-10">
        <Button
          aria-label="Previous testimonial"
          className="rounded-full"
          onClick={() => rotateBy(-1)}
          size="icon-lg"
          type="button"
          variant="inverseOutline"
        >
          <ArrowLeft data-icon="inline-start" />
        </Button>

        <NavigationDots
          active={activeIndex}
          count={total}
          onSelect={jumpTo}
          tone="light"
        />

        <Button
          aria-label="Next testimonial"
          className="rounded-full"
          onClick={() => rotateBy(1)}
          size="icon-lg"
          type="button"
          variant="inverseOutline"
        >
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}

export { TestimonialsCarousel };
