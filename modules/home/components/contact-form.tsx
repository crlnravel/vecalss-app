import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { RadioPillGroup } from "@/components/ui/radio-pill-group";
import { contactTopicOptions } from "../data";

function ContactForm() {
  return (
    <div className="overflow-hidden rounded-[32px] bg-[#f3f3f3] px-5 py-8 md:flex md:items-start md:justify-between md:gap-[120px] md:rounded-[45px] md:px-[100px] md:py-[60px]">
      <form className="flex max-w-[556px] flex-1 flex-col gap-10">
        <RadioPillGroup
          defaultValue="say-hi"
          name="contact-topic"
          options={contactTopicOptions}
        />

        <div className="flex flex-col gap-[25px]">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldInput
              autoComplete="name"
              name="name"
              placeholder="Name"
              type="text"
            />
          </Field>

          <Field>
            <FieldLabel>Email*</FieldLabel>
            <FieldInput
              autoComplete="email"
              name="email"
              placeholder="Email"
              type="email"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="contact-message">Message*</FieldLabel>
            <FieldTextarea
              id="contact-message"
              name="message"
              placeholder="Message"
            />
          </Field>
        </div>

        <Button className="w-full" size="marketing" type="button" variant="brand">
          Send Message
        </Button>
      </form>

      <Image
        alt="Envelope illustration"
        className="hidden h-[465px] w-[465px] shrink-0 md:block"
        height={465}
        src="/landing-assets/contact-mail.svg"
        width={465}
      />
    </div>
  );
}

export { ContactForm };
