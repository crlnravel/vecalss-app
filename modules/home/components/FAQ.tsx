import { AccordionList, type Item } from "@/components/ui/accordion";
import { faqItems as defaultFaqItems } from "../data";

type FAQProps = {
  allowMultiple?: boolean;
  className?: string;
  items?: Item[];
};

export const FAQ = ({
  allowMultiple = false,
  className = "w-full",
  items = defaultFaqItems,
}: FAQProps) => {
  return (
    <AccordionList allowMultiple={allowMultiple} items={items} className={className} />
  );
};
