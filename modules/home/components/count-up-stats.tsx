"use client";

import { useEffect, useRef, useState } from "react";

import type { JourneyStat } from "../data";

type CountUpStatsProps = {
  items: JourneyStat[];
};

function formatValue(value: number, suffix = "") {
  return `${Intl.NumberFormat("id-ID").format(value)}${suffix}`;
}

function CountUpStats({ items }: CountUpStatsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasEntered) return;

    const duration = 1400;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = Math.min(now - startedAt, duration);
      const eased = 1 - Math.pow(1 - elapsed / duration, 3);
      setProgress(eased);

      if (elapsed < duration) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hasEntered]);

  return (
    <section ref={rootRef} className="bg-white">
      <div className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 py-12 md:grid-cols-3 md:px-8 md:py-16 lg:px-10">
        {items.map((item) => {
          const current = progress > 0.995 ? item.value : Math.round(item.value * progress);

          return (
            <div
              key={item.label}
              className="group rounded-5xl border border-[#014C38]/10 bg-[#014C38]/[0.03] p-6 text-center transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#014C38]/18 hover:bg-white hover:shadow-[0_26px_70px_-56px_rgba(1,76,56,0.42)] md:p-8"
            >
              <p className="text-6xl font-semibold leading-none tracking-[-0.05em] text-[#014C38] md:text-7xl">
                {formatValue(current, item.suffix)}
              </p>
              <p className="mt-4 text-sm font-semibold text-[#014C38]/62 md:text-base">
                {item.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export { CountUpStats };
