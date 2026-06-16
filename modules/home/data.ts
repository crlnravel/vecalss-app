import type { Item } from "@/components/ui/accordion";
import type { RadioPillOption } from "@/components/ui/radio-pill-group";

export type NavItem = {
  href: string;
  label: string;
};

export type ProgramCardTone = "accent" | "dark" | "light";
export type ProgramCardChipTone = "accent" | "white";

export type ProgramCardData = {
  art: string;
  artAlt: string;
  chipTone: ProgramCardChipTone;
  href: string;
  title: [string, string];
  tone: ProgramCardTone;
};

export type Testimonial = {
  meta: string;
  name: string;
  quote: string;
};

export const marketingNavItems: NavItem[] = [
  { label: "About us", href: "/about" },
  { label: "Programs", href: "/#programs" },
  { label: "Testimonials", href: "/#testimonials" },
  { label: "FAQ", href: "/faq" },
];

export const footerItems: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About us", href: "/about" },
  { label: "Programs", href: "/#programs" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/#contact" },
];

export const programCards: ProgramCardData[] = [
  {
    title: ["SNBT", "Intensive"],
    href: "#contact",
    art: "/landing-assets/program-stopwatch.svg",
    artAlt: "Stopwatch illustration",
    tone: "light",
    chipTone: "accent",
  },
  {
    title: ["Foundation", "Program"],
    href: "#contact",
    art: "/landing-assets/program-foundation.svg",
    artAlt: "Light bulb illustration",
    tone: "accent",
    chipTone: "white",
  },
  {
    title: ["Weekly", "Tryout"],
    href: "#contact",
    art: "/landing-assets/program-weekly.svg",
    artAlt: "Document illustration",
    tone: "dark",
    chipTone: "white",
  },
  {
    title: ["Smart Drill", "Program"],
    href: "#contact",
    art: "/landing-assets/program-drill.svg",
    artAlt: "Training illustration",
    tone: "light",
    chipTone: "accent",
  },
  {
    title: ["Vera AI", "Mentoring"],
    href: "#contact",
    art: "/landing-assets/program-mentoring.svg",
    artAlt: "AI mentoring illustration",
    tone: "accent",
    chipTone: "white",
  },
  {
    title: ["PTN", "Consultation"],
    href: "#contact",
    art: "/landing-assets/program-consultation.svg",
    artAlt: "Consultation illustration",
    tone: "dark",
    chipTone: "white",
  },
];

export const testimonials: Testimonial[] = [
  {
    quote:
      "The study flow feels clear from day one. I always know what to review, when to take a tryout, and how to fix the topics that are still slowing me down.",
    name: "Raka",
    meta: "SNBT intensive student",
  },
  {
    quote:
      "Vera AI helps when I am studying late at night. Instead of getting stuck and losing momentum, I can ask follow-up questions and keep moving.",
    name: "Nadia",
    meta: "Foundation program student",
  },
  {
    quote:
      "The analytics make revision much more focused. I stop guessing what to study next because the dashboard already shows my weak chapters and timing pattern.",
    name: "Alya",
    meta: "Weekly tryout participant",
  },
];

export const faqItems: Item[] = [
  {
    id: "1",
    number: "01",
    question: "What is Vecalss?",
    answer:
      "Vecalss is a university-preparation platform that brings together guided study paths, timed tryouts, performance analytics, and Vera AI support in one focused learning flow.",
  },
  {
    id: "2",
    number: "02",
    question: "Who is Vecalss designed for?",
    answer:
      "It is built for students who want a more structured way to prepare for competitive university entrance exams, whether they are starting from the basics or sharpening for the final sprint.",
  },
  {
    id: "3",
    number: "03",
    question: "What is included in the learning experience?",
    answer:
      "Students can move through learning modules, join regular tryouts, review detailed analytics, practice targeted drills, and use Vera AI whenever they need clarification or quick feedback.",
  },
  {
    id: "4",
    number: "04",
    question: "What is Vera AI?",
    answer:
      "Vera AI is the platform's always-available learning companion. It helps explain concepts, break down difficult questions, suggest next steps, and keep study sessions moving when a student gets stuck.",
  },
  {
    id: "5",
    number: "05",
    question: "How do tryouts and analytics work?",
    answer:
      "Tryouts simulate timed practice, while the analytics layer highlights accuracy, pacing, topic-level performance, and recurring mistakes so students can revise with more intention instead of guessing.",
  },
  {
    id: "6",
    number: "06",
    question: "Can students focus on weak areas first?",
    answer:
      "Yes. The platform is meant to support focused improvement, so students can revisit specific topics, use targeted drills, and prioritize chapters where their accuracy or speed still needs work.",
  },
  {
    id: "7",
    number: "07",
    question: "Does Vecalss replace live tutoring?",
    answer:
      "Vecalss is designed to make independent preparation more structured and more responsive. It can stand on its own for many students, and it can also work alongside mentoring or classroom study.",
  },
  {
    id: "8",
    number: "08",
    question: "How do I get started?",
    answer:
      "Start by reaching out through the contact form, then the team can help map the right entry point based on your current level, target campus, and preferred study rhythm.",
  },
];

export const contactTopicOptions: readonly RadioPillOption<"quote" | "say-hi">[] = [
  { label: "Say Hi", value: "say-hi" },
  { label: "Get a Quote", value: "quote" },
];
