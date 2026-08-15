"use client";

import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { RadioPillGroup } from "@/components/ui/radio-pill-group";
import { contactTopicOptions } from "../data";

function getFieldError(field: {
  state: { meta: { errors: unknown[]; isTouched: boolean } };
}) {
  if (!field.state.meta.isTouched || field.state.meta.errors.length === 0) {
    return null;
  }

  return String(field.state.meta.errors[0]);
}

function ContactForm() {
  const [submissionState, setSubmissionState] = useState<"idle" | "ready">(
    "idle",
  );

  const form = useForm({
    defaultValues: {
      email: "",
      message: "",
      name: "",
      topic: "say-hi",
    },
    onSubmit: ({ value }) => {
      // The public contact endpoint is not part of the current app contract.
      // Keep this local acknowledgement honest until a server action is added.
      void value;
      setSubmissionState("ready");
    },
  });

  return (
    <div className="overflow-hidden rounded-4xl border border-[#014C38]/10 bg-[#014C38]/[0.025] shadow-[0_30px_90px_-72px_rgba(1,76,56,0.42)]">
      <form
        className="px-6 py-8 md:px-8 lg:px-10 lg:py-10"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <div className="flex flex-col gap-8">
          <form.Field name="topic">
            {(field) => (
              <RadioPillGroup
                name={field.name}
                onValueChange={(value) => {
                  setSubmissionState("idle");
                  field.handleChange(value);
                }}
                options={contactTopicOptions}
                value={field.state.value}
              />
            )}
          </form.Field>

          <div className="grid gap-5 md:grid-cols-2">
            <form.Field
              name="name"
              validators={{
                onBlur: ({ value }) =>
                  value.trim() ? undefined : "Nama wajib diisi.",
              }}
            >
              {(field) => {
                const error = getFieldError(field);

                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Nama</FieldLabel>
                    <FieldInput
                      aria-describedby={error ? `${field.name}-error` : undefined}
                      aria-invalid={Boolean(error)}
                      autoComplete="name"
                      className="rounded-xl border-[#014C38]/14 bg-white text-[#014C38] placeholder:text-[#014C38]/38"
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        setSubmissionState("idle");
                        field.handleChange(event.target.value);
                      }}
                      placeholder="Nama lengkap"
                      type="text"
                      value={field.state.value}
                    />
                    {error ? (
                      <p
                        className="text-sm text-red-700"
                        id={`${field.name}-error`}
                        role="alert"
                      >
                        {error}
                      </p>
                    ) : null}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field
              name="email"
              validators={{
                onBlur: ({ value }) => {
                  if (!value.trim()) return "Email wajib diisi.";
                  return /^\S+@\S+\.\S+$/.test(value)
                    ? undefined
                    : "Gunakan alamat email yang valid.";
                },
              }}
            >
              {(field) => {
                const error = getFieldError(field);

                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <FieldInput
                      aria-describedby={error ? `${field.name}-error` : undefined}
                      aria-invalid={Boolean(error)}
                      autoComplete="email"
                      className="rounded-xl border-[#014C38]/14 bg-white text-[#014C38] placeholder:text-[#014C38]/38"
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        setSubmissionState("idle");
                        field.handleChange(event.target.value);
                      }}
                      placeholder="name@email.com"
                      type="email"
                      value={field.state.value}
                    />
                    {error ? (
                      <p
                        className="text-sm text-red-700"
                        id={`${field.name}-error`}
                        role="alert"
                      >
                        {error}
                      </p>
                    ) : null}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field
              name="message"
              validators={{
                onBlur: ({ value }) => {
                  if (!value.trim()) return "Pesan wajib diisi.";
                  return value.trim().length >= 10
                    ? undefined
                    : "Tulis sedikitnya 10 karakter agar kami memahami kebutuhanmu.";
                },
              }}
            >
              {(field) => {
                const error = getFieldError(field);

                return (
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor={field.name}>Pesan</FieldLabel>
                    <FieldTextarea
                      aria-describedby={error ? `${field.name}-error` : undefined}
                      aria-invalid={Boolean(error)}
                      className="min-h-[190px] rounded-xl border-[#014C38]/14 bg-white text-[#014C38] placeholder:text-[#014C38]/38"
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        setSubmissionState("idle");
                        field.handleChange(event.target.value);
                      }}
                      placeholder="Ceritakan target, kelas, atau program yang ingin kamu tanyakan."
                      value={field.state.value}
                    />
                    {error ? (
                      <p
                        className="text-sm text-red-700"
                        id={`${field.name}-error`}
                        role="alert"
                      >
                        {error}
                      </p>
                    ) : null}
                  </Field>
                );
              }}
            </form.Field>
          </div>

          {submissionState === "ready" ? (
            <p
              aria-live="polite"
              className="rounded-2xl border border-[#014C38]/12 bg-white px-4 py-3 text-sm leading-6 text-[#014C38]/72"
            >
              Formulir sudah lengkap. Detail ini siap diteruskan setelah endpoint
              kontak Vecalss dihubungkan.
            </p>
          ) : null}

          <form.Subscribe
            selector={(state) => [state.isSubmitting, state.canSubmit]}
          >
            {([isSubmitting, canSubmit]) => (
              <Button
                className="w-full rounded-full bg-[#014C38] py-3.5 text-sm font-semibold text-white hover:bg-[#014C38]/90"
                disabled={isSubmitting || !canSubmit}
                size="marketing"
                type="submit"
                variant="brand"
              >
                {isSubmitting ? "Memeriksa..." : "Kirim Pesan"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </div>
  );
}

export { ContactForm };
