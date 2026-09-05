import { cva } from "class-variance-authority";

const studentCatalogueCardVariants = cva(
  "group relative min-w-0 overflow-hidden rounded-[2rem] border border-primary-100 outline-none shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] transition-[transform,border-color,box-shadow] duration-300 hover:border-primary-200 hover:shadow-[0_24px_52px_-30px_color-mix(in_oklab,var(--voyage-forest)_55%,transparent)] focus-visible:ring-4 focus-visible:ring-primary-400/30 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        materi:
          "grid min-h-[10.5rem] grid-cols-1 bg-[linear-gradient(110deg,#ffffff_0%,#ffffff_68%,#f1faf4_100%)] p-5 text-secondary-900 md:grid-cols-[5rem_minmax(0,1fr)_3rem] md:items-center md:gap-7 md:p-7",
        kuis:
          "flex min-h-[246px] flex-col bg-white p-6 text-primary-900 md:min-h-[270px] md:p-7",
        tryout:
          "flex min-h-[26rem] flex-col bg-white text-secondary-900",
      },
    },
  },
);

export { studentCatalogueCardVariants };
