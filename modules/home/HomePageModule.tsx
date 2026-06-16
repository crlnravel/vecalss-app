import Image from "next/image";

import { getRegistrationFormUrl } from "@/lib/config";

import { ContactForm } from "./components/contact-form";
import { FAQ } from "./components/FAQ";
import { MarketingHeader } from "./components/marketing-header";
import {
  ActionButtonLink,
  SectionHeading,
} from "./components/home-primitives";
import { HomeFooter } from "./components/home-footer";
import { ProgramCard } from "./components/program-card";
import { TestimonialsCarousel } from "./components/testimonials-carousel";
import { faqItems, programCards } from "./data";

export default function HomePageModule() {
  const registerUrl = getRegistrationFormUrl();

  return (
    <main className="overflow-x-hidden bg-white text-secondary-900">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-20 px-0 py-4 md:gap-[280px] md:py-3">
        <section id="about" className="flex flex-col gap-8 md:gap-[60px]">
          <MarketingHeader currentPath="/" />

          <div className="flex flex-col gap-6 px-4 md:min-h-[768px] md:flex-row md:items-center md:justify-between md:px-[100px]">
            <div className="flex max-w-[531px] flex-col gap-5 md:gap-[35px]">
              <h1 className="max-w-[531px] text-[40px] leading-[1.1] font-medium text-black md:text-[60px]">
                Achieve Your Dream University
              </h1>
              <Image
                alt="Student achievement illustration"
                className="mx-auto h-[246px] w-[246px] md:hidden"
                height={246}
                src="/landing-assets/hero-rating.svg"
                width={246}
              />
              <p className="max-w-[498px] text-[18px] leading-[1.35] text-black md:text-[20px] md:leading-7">
                Master every topic through structured learning modules, realistic tryouts,
                personalized analytics, and Vera AI—your 24/7 dedicated tutor.
              </p>
              <div className="flex flex-col gap-3 md:flex-row">
                <ActionButtonLink className="w-full md:w-fit" href={registerUrl}>
                  Register now
                </ActionButtonLink>
                <ActionButtonLink className="w-full md:w-fit" href="/login" variant="brandOutline">
                  Student login
                </ActionButtonLink>
              </div>
            </div>

            <Image
              alt="Student achievement illustration"
              className="hidden h-[350px] w-[350px] shrink-0 md:block"
              height={350}
              src="/landing-assets/hero-rating.svg"
              width={350}
            />
          </div>
        </section>

        <section id="programs" className="flex flex-col gap-12 md:gap-[48px]">
          <SectionHeading
            label="Programs"
            description="Explore our structured preparation programs designed to help you master the material, ace your exams, and secure your dream university seat."
          />

          <div className="grid gap-5 px-4 md:grid-cols-2 md:gap-10 md:px-[100px]">
            {programCards.map((card) => (
              <ProgramCard key={card.title.join("-")} {...card} />
            ))}
          </div>
        </section>

        <section className="px-4 md:px-[100px]">
          <div className="overflow-hidden rounded-[32px] bg-[#f3f3f3] px-6 py-10 md:flex md:h-[347px] md:items-center md:justify-between md:gap-[250px] md:rounded-[45px] md:px-[60px] md:py-0">
            <div className="flex max-w-[500px] flex-col gap-6">
              <h2 className="text-[28px] leading-[1.1] font-medium text-black md:text-[30px]">
                Let’s secure your dream campus!
              </h2>
              <p className="text-[18px] leading-tight text-black">
                Ready to ace the entrance test? Join Vecalss today to unlock structured
                learning modules, intensive weekly tryouts, and 24/7 personalized guidance
                from Vera AI!
              </p>
              <div className="flex flex-col gap-3 md:flex-row">
                <ActionButtonLink className="w-full md:w-fit" href={registerUrl}>
                  Save your spot now!
                </ActionButtonLink>
                <ActionButtonLink className="w-full md:w-fit" href="/login" variant="brandOutline">
                  Student login
                </ActionButtonLink>
              </div>
            </div>

            <Image
              alt="Chat and guidance illustration"
              className="mx-auto mt-8 h-[175px] w-[175px] md:mt-0 md:h-[400px] md:w-[400px] md:-translate-y-6"
              height={400}
              src="/landing-assets/cta-chat.svg"
              width={400}
            />
          </div>
        </section>

        <section id="faq" className="flex flex-col gap-12 md:gap-[48px]">
          <SectionHeading
            label="FAQ"
            description="Everything you need to know about the Vecalss learning experience, programs, and AI features."
            tone="mint"
          />
          <div className="px-4 md:px-[100px]">
            <div className="mx-auto w-full max-w-[1234px]">
              <FAQ items={faqItems.slice(0, 6)} />
            </div>
            <div className="mt-8 flex justify-center">
              <ActionButtonLink href="/faq" variant="brandOutline">
                Explore the full FAQ
              </ActionButtonLink>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="flex flex-col gap-12 md:gap-[48px]"
        >
          <SectionHeading
            label="Testimonials"
            description="A snapshot of what students value most when they need prep that feels structured, responsive, and less overwhelming."
          />

          <div id="testimonials" className="px-4 md:px-[100px]">
            <TestimonialsCarousel />
          </div>
        </section>

        <section id="contact" className="flex flex-col gap-12 md:gap-[48px]">
          <SectionHeading
            label="Contact Us"
            description="Tell us where you are in your university-prep journey, and we will help you choose the best way to start."
            tone="mint"
          />

          <div className="px-4 md:px-[100px]">
            <ContactForm />
          </div>
        </section>
      </div>

      <HomeFooter />
    </main>
  );
}
