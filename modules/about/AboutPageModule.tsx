import Image from "next/image";
import {
  BrainCircuit,
  ChartColumnBig,
  NotebookPen,
  TimerReset,
} from "@/lib/icons";

import { Badge } from "@/components/ui/badge";
import { ActionButtonLink } from "@/modules/home/components/home-primitives";
import { HomeFooter } from "@/modules/home/components/home-footer";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

const proofPoints = [
  {
    value: "24/7",
    label: "Vera AI study support",
  },
  {
    value: "Weekly",
    label: "tryout and review rhythm",
  },
  {
    value: "Topic",
    label: "level performance signals",
  },
];

const principles = [
  {
    title: "Sequence before speed",
    description:
      "Students move through concepts, drills, timed work, and review in a deliberate order instead of chasing disconnected material.",
    icon: NotebookPen,
  },
  {
    title: "Support at the exact stuck point",
    description:
      "Vera AI keeps study sessions from stalling by helping students unpack concepts, question types, and next steps in the moment.",
    icon: BrainCircuit,
  },
  {
    title: "Signals over guesswork",
    description:
      "Analytics show whether the real bottleneck is accuracy, pacing, topic mastery, or consistency, so revision has a clear target.",
    icon: ChartColumnBig,
  },
];

const methodSteps = [
  {
    number: "01",
    label: "Baseline",
    title: "Map the starting point",
    description:
      "Students begin with their current level, target campus, and highest-friction subjects, giving the platform a useful first map.",
  },
  {
    number: "02",
    label: "Cadence",
    title: "Build a weekly study rhythm",
    description:
      "Modules, drills, and tryouts are arranged around repeatable habits, not last-minute bursts that are hard to sustain.",
  },
  {
    number: "03",
    label: "Review",
    title: "Read the performance pattern",
    description:
      "Topic-level analytics and timing data reveal where confidence is real and where a student is still relying on luck.",
  },
  {
    number: "04",
    label: "Adjust",
    title: "Return to the right material",
    description:
      "Weak areas become the next learning path, with Vera AI available when a concept needs another explanation or a faster reset.",
  },
];

export default function AboutPageModule() {
  return (
    <main className="overflow-x-hidden bg-[linear-gradient(180deg,#faf6ec_0%,#f6efdf_46%,#efe5d2_100%)] text-secondary-900">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-18 px-0 py-4 md:gap-24 md:py-3">
        <section className="flex flex-col gap-8 md:gap-10">
          <MarketingHeader currentPath="/about" />

          <div className="px-4 md:px-8 lg:px-10 xl:px-[100px]">
            <div className="grid gap-10 border-y border-secondary-900/15 py-12 md:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.72fr)] md:items-center md:gap-14 md:py-[72px]">
              <div>
                <Badge size="card" variant="accent">
                  About Vecalss
                </Badge>

                <h1 className="mt-7 max-w-[850px] text-5xl leading-[1.03] font-medium text-secondary-900 md:text-7xl">
                  Vecalss makes university prep feel less scattered.
                </h1>

                <p className="mt-6 max-w-[670px] text-lg leading-7 text-secondary-900/78 md:text-2xl md:leading-8">
                  Students get a clean path from concepts to timed practice, with
                  analytics and Vera AI support keeping each week focused on the
                  work that actually moves the score.
                </p>

                <div className="mt-9 flex flex-col gap-4 sm:flex-row">
                  <ActionButtonLink href="/#contact">Talk with the team</ActionButtonLink>
                  <ActionButtonLink href="/faq" variant="marketingOutline">
                    Explore the FAQ
                  </ActionButtonLink>
                </div>
              </div>

              <div className="navy-panel relative overflow-hidden rounded-5xl p-6 text-white md:p-8">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,197,24,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.07),transparent_30%)]" />

                <div className="relative flex items-start justify-between gap-8">
                  <div>
                    <p className="text-sm font-medium tracking-[0.16em] text-accent-300 uppercase">
                      Learning system
                    </p>
                    <h2 className="mt-4 max-w-[330px] text-4xl leading-[1.08] font-medium md:text-5xl">
                      One route from preparation noise to focused progress.
                    </h2>
                  </div>

                  <div className="relative hidden h-[118px] w-[118px] shrink-0 rounded-5xl border border-white/12 bg-[#fffaf0] shadow-[0_22px_58px_-38px_rgba(0,0,0,0.48)] md:block">
                    <Image
                      alt="Vecalss learning support illustration"
                      fill
                      className="object-contain p-4"
                      sizes="118px"
                      src="/landing-assets/hero-rating.svg"
                    />
                  </div>
                </div>

                <div className="relative mt-9 divide-y divide-white/16 border-y border-white/16">
                  {proofPoints.map((item) => (
                    <div
                      key={item.value}
                      className="grid grid-cols-[96px_1fr] items-center gap-5 py-4"
                    >
                      <p className="text-3xl leading-none font-medium text-accent-300 md:text-4xl">
                        {item.value}
                      </p>
                      <p className="text-base leading-6 text-white/78">{item.label}</p>
                    </div>
                  ))}
                </div>

                <div className="relative mt-8 flex items-center gap-4 border-t border-white/16 pt-6">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-white/10">
                    <TimerReset className="size-5" />
                  </span>
                  <p className="text-base leading-6 text-white/78">
                    Designed for students who need structure, honest feedback, and fast
                    recovery when a study session gets stuck.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 md:px-8 lg:px-10 xl:px-[100px]">
          <div className="grid gap-10 md:grid-cols-[0.36fr_0.64fr] md:items-start md:gap-14">
            <div className="md:sticky md:top-8">
              <Badge size="section" variant="mint">
                Why it works
              </Badge>
              <h2 className="mt-6 max-w-[390px] text-4xl leading-[1.1] font-medium text-black md:text-5xl">
                A calmer system for high-stakes learning.
              </h2>
              <p className="mt-5 max-w-[420px] text-lg leading-7 text-secondary-900/72">
                The platform is built around one practical question: what should a
                student do next to improve with less wasted effort?
              </p>
            </div>

            <div className="grid gap-4">
              {principles.map((card) => {
                const Icon = card.icon;

                return (
                  <article
                    key={card.title}
                    className="grid gap-5 rounded-4xl border border-secondary-900/12 bg-[rgba(255,250,239,0.94)] p-6 shadow-[0_24px_58px_-40px_rgba(25,26,35,0.18)] backdrop-blur md:grid-cols-[56px_1fr] md:p-7"
                  >
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-2xl leading-[1.15] font-medium text-black md:text-4xl">
                        {card.title}
                      </h3>
                      <p className="mt-3 max-w-[690px] text-base leading-7 text-secondary-900/74 md:text-lg">
                        {card.description}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-4 md:px-8 lg:px-10 xl:px-[100px]">
          <div className="border-t border-secondary-900/15">
            <div className="grid gap-5 py-8 md:grid-cols-[0.36fr_0.64fr] md:gap-14 md:py-11">
              <div>
                <Badge size="section" variant="accent">
                  Our method
                </Badge>
              </div>
              <div>
                <h2 className="max-w-[760px] text-4xl leading-[1.1] font-medium text-black md:text-6xl">
                  Preparation becomes easier to trust when every step has a job.
                </h2>
              </div>
            </div>

            {methodSteps.map((step) => (
              <article
                key={step.number}
                className="grid gap-5 border-t border-secondary-900/15 py-7 md:grid-cols-[120px_0.8fr_1fr] md:gap-8 md:py-8"
              >
                <div className="flex items-center justify-between gap-4 md:block">
                  <p className="text-5xl leading-none font-medium text-primary-700 md:text-6xl">
                    {step.number}
                  </p>
                  <p className="rounded-full border border-primary-700/18 bg-primary-50 px-3 py-1 text-xs font-medium tracking-[0.14em] text-primary-700 uppercase md:mt-4 md:inline-flex">
                    {step.label}
                  </p>
                </div>
                <h3 className="text-2xl leading-[1.18] font-medium text-black md:text-4xl">
                  {step.title}
                </h3>
                <p className="max-w-[620px] text-base leading-7 text-secondary-900/74 md:text-lg">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="px-4 md:px-8 lg:px-10 xl:px-[100px]">
          <div className="grid overflow-hidden rounded-5xl border border-primary-700/10 bg-[#eff6ef] shadow-[0_26px_72px_-46px_rgba(11,18,45,0.2)] md:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-7 md:p-12">
              <h2 className="max-w-[690px] text-4xl leading-[1.1] font-medium text-black md:text-5xl">
                Ready for a prep routine that feels focused and human?
              </h2>
              <p className="mt-5 max-w-[610px] text-lg leading-7 text-secondary-900/74 md:text-lg">
                Share your goal, current level, and hardest subjects. The Vecalss
                team can help you find the right starting point.
              </p>
              <div className="mt-8">
                <ActionButtonLink className="w-full md:w-fit" href="/#contact">
                  Start the conversation
                </ActionButtonLink>
              </div>
            </div>

            <div className="relative overflow-hidden border-t border-primary-700/10 bg-[linear-gradient(165deg,rgba(14,59,33,0.99),rgba(11,45,25,0.98))] px-8 pt-8 md:border-t-0 md:border-l">
              <div className="atlas-grid absolute inset-0 opacity-[0.08]" />
              <div className="absolute right-6 top-6 flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/8 md:size-20">
                <Image
                  alt=""
                  fill
                  className="object-contain p-3"
                  sizes="80px"
                  src="/landing-assets/program-stopwatch.svg"
                />
              </div>
              <div className="relative flex h-full items-end justify-center">
                <div className="flex h-[220px] w-[220px] items-center justify-center rounded-full bg-[#fff9ed] shadow-[0_28px_74px_-42px_rgba(0,0,0,0.52)] md:h-[310px] md:w-[310px]">
                  <div className="relative h-[168px] w-[168px] md:h-[230px] md:w-[230px]">
                    <Image
                      alt="Vera AI learning support illustration"
                      fill
                      unoptimized
                      className="object-contain drop-shadow-[0_16px_28px_rgba(11,18,45,0.1)]"
                      sizes="(min-width: 768px) 230px, 168px"
                      src="/landing-assets/cta-chat.svg"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <HomeFooter />
    </main>
  );
}
