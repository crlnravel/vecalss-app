import { cn } from "@/lib/utils";
import type { Testimonial } from "../data";

function TestimonialCard({
  testimonial,
  className,
  compact = false,
  isActive = true,
}: {
  className?: string;
  compact?: boolean;
  isActive?: boolean;
  testimonial: Testimonial;
}) {
  return (
    <article
      className={cn(
        "transition-all duration-500",
        isActive ? "opacity-100" : "opacity-65",
        className,
      )}
    >
      <div
        className={cn(
          "relative rounded-[32px] border border-accent-300 bg-primary-700 px-6 py-7 text-white shadow-[0px_5px_0px_0px_#191a23]/0 md:rounded-[45px]",
          compact ? "md:px-8 md:py-8" : "md:px-[52px] md:py-[48px]",
          isActive && "shadow-[0px_10px_30px_0px_rgba(0,0,0,0.18)]",
        )}
      >
        <p
          className={cn(
            "text-base leading-[1.45]",
            compact ? "md:text-2xl/[1.4]" : "md:text-4xl/[1.28]",
          )}
        >
          “{testimonial.quote}”
        </p>
        <div className="absolute bottom-[-18px] left-20 h-9 w-9 rotate-45 border-r border-b border-accent-300 bg-primary-700" />
      </div>
      <div className={cn("pt-8 pl-5", compact ? "md:pt-8 md:pl-10" : "md:pt-10 md:pl-20")}>
        <p className="text-xl leading-tight font-medium text-accent-300">
          {testimonial.name}
        </p>
        <p className="text-lg leading-tight text-white">{testimonial.meta}</p>
      </div>
    </article>
  );
}

export { TestimonialCard };
