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

export const navItems: NavItem[] = [
  { label: "About us", href: "#about" },
  { label: "Programs", href: "#programs" },
  { label: "Features", href: "#features" },
  { label: "FAQ", href: "#faq" },
];

export const footerItems: NavItem[] = [
  { label: "About us", href: "#about" },
  { label: "Services", href: "#programs" },
  { label: "Use Cases", href: "#features" },
  { label: "Pricing", href: "#contact" },
  { label: "Blog", href: "#testimonials" },
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
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit.",
    name: "John Smith",
    meta: "Marketing Director at XYZ Corp",
  },
  {
    quote:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit.",
    name: "Andi Saputra",
    meta: "SMAN 68 Jakarta",
  },
  {
    quote:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit.",
    name: "Andi Savitri",
    meta: "SMAN 12 Pekalongan",
  },
];

export const contactTopicOptions: readonly RadioPillOption<"quote" | "say-hi">[] = [
  { label: "Say Hi", value: "say-hi" },
  { label: "Get a Quote", value: "quote" },
];
