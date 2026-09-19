"use client";

import Image from "next/image";
import { useState } from "react";

import { ChevronLeft, ChevronRight, Star } from "@/lib/icons";

import type { Testimonial } from "../data";

type CardPosition = "active" | "hidden" | "next" | "previous";

function TestimonialCard({ item, position }: { item: Testimonial; position: CardPosition }) {
  return (
    <article
      aria-hidden={position !== "active"}
      className="home-testimonial-card absolute left-1/2 top-4 w-[min(86vw,430px)] px-7 py-9 text-center md:px-10 md:py-10"
      data-position={position}
    >
      <div className="relative mx-auto size-[72px] overflow-hidden rounded-[16px] border border-[var(--voyage-deep)]/10 md:size-20">
        <Image alt={item.avatarAlt} fill className="object-cover" sizes="80px" src={item.avatarSrc} />
      </div>
      <h3 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[var(--voyage-deep)] md:text-3xl">
        {item.name}
      </h3>
      <p className="mx-auto mt-1 max-w-[30ch] text-sm leading-6 text-[var(--voyage-deep)]/78">{item.meta}</p>
      <div aria-label="5 dari 5 bintang" className="mt-7 flex items-center justify-center gap-1.5 text-[var(--rating-gold,#e8ad16)]">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star aria-hidden="true" className="size-[18px]" key={index} weight="fill" />
        ))}
        <span className="ml-2 text-sm font-semibold tabular-nums text-[var(--voyage-deep)]/78">5,0</span>
      </div>
      <blockquote className="mx-auto mt-6 max-w-[36ch] text-sm leading-6 text-[var(--voyage-deep)]/78 md:text-base md:leading-7">
        “{item.quote}”
      </blockquote>
    </article>
  );
}

function TestimonialStage({ items }: { items: Testimonial[] }) {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<-1 | 1>(1);

  function move(nextDirection: -1 | 1) {
    setDirection(nextDirection);
    setActive((current) => (current + nextDirection + items.length) % items.length);
  }

  function getPosition(index: number): CardPosition {
    const offset = (index - active + items.length) % items.length;
    if (offset === 0) return "active";
    if (offset === 1) return "next";
    if (offset === items.length - 1) return "previous";
    return "hidden";
  }

  return (
    <div
      className="motion-testimonial-stage mx-auto mt-20 flex w-full max-w-[1280px] flex-col items-center md:mt-28"
      data-direction={direction}
    >
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        Cerita {active + 1} dari {items.length}: {items[active]?.name}
      </p>

      <div className="home-testimonial-deck relative flex min-h-[500px] w-full items-start justify-center overflow-hidden px-3 pt-3 md:min-h-[540px] md:overflow-visible">
        {items.map((item, index) => (
          <TestimonialCard item={item} key={`${item.name}-${item.meta}`} position={getPosition(index)} />
        ))}
      </div>

      <div className="home-testimonial-controls mt-1 flex items-center gap-3">
        <button
          aria-label="Cerita sebelumnya"
          className="landing-elevated-button landing-elevated-button-light flex size-11 items-center justify-center rounded-full border border-[var(--voyage-deep)]/16 bg-white text-[var(--voyage-deep)] transition-[border-color,transform] hover:-translate-x-0.5 hover:border-[var(--voyage-deep)]/35 active:translate-x-0"
          onClick={() => move(-1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <button
          aria-label="Cerita berikutnya"
          className="landing-elevated-button landing-elevated-button-light flex size-11 items-center justify-center rounded-full border border-[var(--voyage-deep)]/16 bg-white text-[var(--voyage-deep)] transition-[border-color,transform] hover:translate-x-0.5 hover:border-[var(--voyage-deep)]/35 active:translate-x-0"
          onClick={() => move(1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  );
}

export { TestimonialStage };
