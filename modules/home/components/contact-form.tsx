import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { RadioPillGroup } from "@/components/ui/radio-pill-group";
import { contactTopicOptions } from "../data";

function ContactForm() {
  return (
    <div className="overflow-hidden rounded-[26px] border border-[#014C38]/10 bg-[#014C38]/[0.025] shadow-[0_30px_90px_-72px_rgba(1,76,56,0.42)]">
      <form className="px-6 py-8 md:px-8 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-8">
          <RadioPillGroup
            defaultValue="say-hi"
            name="contact-topic"
            options={contactTopicOptions}
          />

          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel>Nama</FieldLabel>
              <FieldInput
                autoComplete="name"
                className="rounded-[14px] border-[#014C38]/14 bg-white text-[#014C38] placeholder:text-[#014C38]/38"
                name="name"
                placeholder="Nama lengkap"
                type="text"
              />
            </Field>

            <Field>
              <FieldLabel>Email</FieldLabel>
              <FieldInput
                autoComplete="email"
                className="rounded-[14px] border-[#014C38]/14 bg-white text-[#014C38] placeholder:text-[#014C38]/38"
                name="email"
                placeholder="name@email.com"
                type="email"
              />
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="contact-message">Pesan</FieldLabel>
              <FieldTextarea
                className="min-h-[190px] rounded-[14px] border-[#014C38]/14 bg-white text-[#014C38] placeholder:text-[#014C38]/38"
                id="contact-message"
                name="message"
                placeholder="Ceritakan target, kelas, atau program yang ingin kamu tanyakan."
              />
            </Field>
          </div>

          <Button
            className="w-full rounded-full bg-[#014C38] py-3.5 text-[14px] font-semibold text-white hover:bg-[#014C38]/90 md:text-[15px]"
            size="marketing"
            type="button"
            variant="brand"
          >
            Kirim Pesan
          </Button>
        </div>
      </form>
    </div>
  );
}

export { ContactForm };
