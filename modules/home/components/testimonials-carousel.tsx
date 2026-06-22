"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { Testimonial } from "../data";

type TestimonialsCarouselProps = {
  items: Testimonial[];
};

function TestimonialsCarousel({ items }: TestimonialsCarouselProps) {
  const [index, setIndex] = useState(0);
  const active = items[index];

  const move = (direction: -1 | 1) => {
    setIndex((current) => (current + direction + items.length) % items.length);
  };

  return (
    <div className="overflow-hidden rounded-[18px] border border-white/12 bg-white/[0.04]">
      <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
        <div className="relative min-h-[320px] bg-[#eef1f3]">
          <Image
            alt={active.avatarAlt}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 340px, 100vw"
            src={active.avatarSrc}
          />
        </div>

        <div className="flex min-h-[320px] flex-col justify-between p-6 md:p-9">
          <div>
            <p className="kicker-label text-white/68">{active.university}</p>
            <blockquote className="mt-6 max-w-[720px] text-[28px] leading-[1.18] text-white md:text-[44px]">
              &ldquo;{active.quote}&rdquo;
            </blockquote>
          </div>

          <div className="mt-8 flex flex-col gap-5 border-t border-white/12 pt-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[24px] font-semibold tracking-[-0.02em] text-white">
                {active.name}
              </p>
              <p className="mt-1 text-sm text-white/60">{active.meta}</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                aria-label="Previous testimonial"
                className="inline-flex size-11 items-center justify-center rounded-full border border-white/16 text-white transition-colors hover:border-white/48 hover:text-white/68"
                onClick={() => move(-1)}
                type="button"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                aria-label="Next testimonial"
                className="inline-flex size-11 items-center justify-center rounded-full border border-white/16 text-white transition-colors hover:border-white/48 hover:text-white/68"
                onClick={() => move(1)}
                type="button"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-t border-white/12 px-6 py-4 md:px-9">
        {items.map((item, itemIndex) => (
          <button
            aria-label={`Show testimonial from ${item.name}`}
            className={`h-1.5 rounded-full transition-all ${
              itemIndex === index ? "w-12 bg-white" : "w-5 bg-white/22 hover:bg-white/40"
            }`}
            key={item.name}
            onClick={() => setIndex(itemIndex)}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}

export { TestimonialsCarousel };
