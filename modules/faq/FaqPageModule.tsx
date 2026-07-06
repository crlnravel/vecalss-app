import {
  ArrowRight,
  MessageCircleQuestionMark,
  Minus,
  Plus,
  ScanSearch,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ActionButtonLink } from "@/modules/home/components/home-primitives";
import { faqItems } from "@/modules/home/data";
import { HomeFooter } from "@/modules/home/components/home-footer";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

const faqHighlights = [
  {
    title: "Programs",
    description: "Study paths, weekly tryouts, targeted drills, and consultation.",
    icon: ScanSearch,
  },
  {
    title: "Vera AI",
    description: "Always-available explanations, hints, and study-session resets.",
    icon: Sparkles,
  },
  {
    title: "Starting point",
    description: "What to share with the team and how students enter the flow.",
    icon: MessageCircleQuestionMark,
  },
];

const supportLanes = [
  "University-prep structure",
  "Tryouts and analytics",
  "AI mentoring support",
  "Enrollment guidance",
];

export default function FaqPageModule() {
  return (
    <main className="overflow-x-hidden bg-[linear-gradient(180deg,#faf6ec_0%,#f6efdf_46%,#efe5d2_100%)] text-secondary-900">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-18 px-0 py-4 md:gap-22 md:py-3">
        <section className="flex flex-col gap-8 md:gap-10">
          <MarketingHeader currentPath="/faq" />

          <div className="px-4 md:px-8 lg:px-10 xl:px-[100px]">
            <div className="grid gap-10 border-y border-secondary-900/15 py-12 md:grid-cols-[minmax(0,0.98fr)_minmax(360px,0.72fr)] md:items-end md:gap-16 md:py-[72px]">
              <div>
                <Badge size="card" variant="mint">
                  FAQ
                </Badge>

                <h1 className="mt-7 max-w-[840px] text-5xl leading-[1.03] font-medium text-secondary-900 md:text-7xl">
                  Clear answers before you choose a study path.
                </h1>

                <p className="mt-6 max-w-[660px] text-lg leading-7 text-secondary-900/78 md:text-2xl md:leading-8">
                  A focused guide to Vecalss programs, Vera AI support, tryouts,
                  analytics, and the first step for students who want a more
                  structured prep routine.
                </p>

                <div className="mt-9 flex flex-col gap-4 sm:flex-row">
                  <ActionButtonLink href="/#contact">Ask us directly</ActionButtonLink>
                  <ActionButtonLink href="/about" variant="brandOutline">
                    Learn about Vecalss
                  </ActionButtonLink>
                </div>
              </div>

              <div className="parchment-panel rounded-[28px] p-5 md:p-7">
                <div className="flex items-center justify-between gap-5 border-b border-secondary-900/12 pb-5">
                  <div>
                    <p className="text-sm font-medium tracking-[0.16em] text-primary-700 uppercase">
                      Quick map
                    </p>
                    <h2 className="mt-2 text-3xl leading-[1.12] font-medium text-black md:text-4xl">
                      The most common decisions in one place.
                    </h2>
                  </div>
                  <span className="hidden size-11 shrink-0 items-center justify-center rounded-[8px] bg-primary-50 text-primary-700 md:flex">
                    <ArrowRight className="size-5" />
                  </span>
                </div>

                <div className="mt-5 grid gap-3">
                  {faqHighlights.map((item) => {
                    const Icon = item.icon;

                    return (
                      <article
                        key={item.title}
                        className="grid grid-cols-[44px_1fr] gap-4 rounded-[8px] bg-[#f7faf5] p-4"
                      >
                        <span className="flex size-11 items-center justify-center rounded-[8px] bg-white text-primary-700">
                          <Icon className="size-5" />
                        </span>
                        <div>
                          <h3 className="text-xl leading-tight font-medium text-black">
                            {item.title}
                          </h3>
                          <p className="mt-1 text-base leading-6 text-secondary-900/70">
                            {item.description}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 md:px-8 lg:px-10 xl:px-[100px]">
          <div className="grid gap-10 md:grid-cols-[300px_minmax(0,1fr)] md:gap-16">
            <aside className="rounded-[28px] bg-[rgba(255,250,239,0.72)] p-6 shadow-[0_22px_58px_-44px_rgba(11,18,45,0.16)] md:sticky md:top-8 md:self-start">
              <Badge size="section" variant="accent">
                Common questions
              </Badge>
              <h2 className="mt-6 text-4xl leading-[1.1] font-medium text-black md:text-5xl">
                Straight answers, no maze.
              </h2>
              <div className="mt-7 rounded-[20px] border border-secondary-900/10 bg-white/72 px-4">
                {supportLanes.map((lane) => (
                  <p
                    key={lane}
                    className="border-b border-secondary-900/12 py-3 text-base leading-6 text-secondary-900/72 last:border-b-0"
                  >
                    {lane}
                  </p>
                ))}
              </div>
            </aside>

            <div className="parchment-panel rounded-[28px] px-5 md:px-8">
              {faqItems.map((item, index) => (
                <details
                  key={item.id}
                  className="group border-b border-secondary-900/12 py-6 last:border-b-0 md:py-7"
                  open={index === 0}
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-5 outline-none transition-colors hover:text-primary-700 focus-visible:text-primary-700 [&::-webkit-details-marker]:hidden">
                    <span className="grid gap-3 md:grid-cols-[64px_1fr] md:gap-6">
                      <span className="inline-flex h-fit w-fit rounded-full bg-primary-50 px-3 py-1 text-xs leading-none font-medium tracking-[0.14em] text-primary-700 md:mt-1">
                        {item.number}
                      </span>
                      <span className="text-2xl leading-[1.18] font-medium text-black md:text-4xl">
                        {item.question}
                      </span>
                    </span>

                    <span
                      aria-hidden="true"
                      className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-secondary-900/14 bg-[#fbfcf8] text-secondary-900"
                    >
                      <Plus className="size-4 group-open:hidden" />
                      <Minus className="hidden size-4 group-open:block" />
                    </span>
                  </summary>

                  <div className="mt-5 md:ml-[88px]">
                    <p className="max-w-[760px] text-base leading-7 text-secondary-900/74 md:text-lg md:leading-8">
                      {item.answer}
                    </p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 md:px-8 lg:px-10 xl:px-[100px]">
          <div className="navy-panel relative grid gap-8 overflow-hidden rounded-[32px] p-7 text-white md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-11">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,197,24,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.07),transparent_28%)]" />
            <div className="relative">
              <p className="text-sm font-medium tracking-[0.16em] text-accent-300 uppercase">
                Still unsure
              </p>
              <h2 className="mt-4 max-w-[690px] text-4xl leading-[1.1] font-medium md:text-5xl">
                Tell us your goal and we will help find the cleanest starting lane.
              </h2>
              <p className="mt-5 max-w-[650px] text-lg leading-7 text-white/76 md:text-lg">
                Share your current level, target campus, and the subjects that feel
                hardest right now. The team can point you toward a realistic first
                step.
              </p>
            </div>

            <div className="relative flex flex-col gap-4 sm:flex-row md:flex-col">
              <ActionButtonLink href="/#contact">Contact the team</ActionButtonLink>
              <ActionButtonLink href="/about" variant="inverseOutline">
                Read our approach
              </ActionButtonLink>
            </div>
          </div>
        </section>
      </div>

      <HomeFooter />
    </main>
  );
}
