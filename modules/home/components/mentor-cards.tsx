"use client";

import Image from "next/image";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CrewMember } from "../data";

type MentorCardsProps = {
  members: CrewMember[];
};

function MentorCards({ members }: MentorCardsProps) {
  return (
    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((member, index) =>
        member.isEmpty ? (
          <article
            aria-hidden="true"
            className="min-h-[402px] overflow-hidden rounded-4xl border border-dashed border-[var(--voyage-deep)]/14 bg-[var(--voyage-deep)]/[0.025]"
            key={member.id}
          />
        ) : (
          <Dialog key={member.id}>
            <DialogTrigger
              render={
                <button
                  aria-label={`Lihat profil ${member.name}`}
                  className="group overflow-hidden rounded-4xl bg-white text-left transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_34px_90px_-72px_color-mix(in_oklab,var(--voyage-deep)_55%,transparent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--voyage-deep)]/18"
                  type="button"
                />
              }
            >
              <div className="relative aspect-[1/1] overflow-hidden bg-transparent">
                <Image
                  alt={member.photoAlt}
                  fill
                  className="object-cover transition-[filter,transform] duration-700 ease-[cubic-bezier(0.2,0.72,0.22,1)] group-hover:scale-[1.045] group-hover:brightness-[0.82] group-hover:saturate-[0.95]"
                  priority={index < 2}
                  sizes="(min-width: 1024px) 33vw, 50vw"
                  src={member.photoSrc}
                />
                <div className="absolute inset-0 bg-[var(--voyage-deep)]/0 transition-colors duration-700 ease-[cubic-bezier(0.2,0.72,0.22,1)] group-hover:bg-[var(--voyage-deep)]/16" />
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--voyage-deep)]/42 via-[var(--voyage-deep)]/12 to-transparent transition-opacity duration-700 ease-[cubic-bezier(0.2,0.72,0.22,1)] group-hover:opacity-90" />
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-3xl font-semibold leading-tight tracking-[-0.03em] text-[var(--voyage-deep)]">
                      {member.name}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-[var(--voyage-deep)]/62">
                      {member.focus}
                    </p>
                  </div>
                  {member.campusMarkSrc ? (
                    <div className="relative size-10 shrink-0">
                      <Image
                        alt={member.campusMarkAlt ?? `${member.campus} mark`}
                        fill
                        className="object-contain"
                        sizes="40px"
                        src={member.campusMarkSrc}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </DialogTrigger>

            <DialogContent
              className="max-h-[calc(100vh-2rem)] max-w-[940px] gap-0 overflow-hidden rounded-5xl border border-[var(--voyage-deep)]/12 bg-[var(--voyage-canvas)] p-0 text-[var(--voyage-deep)] shadow-[0_32px_110px_-46px_color-mix(in_oklab,var(--secondary-900)_60%,transparent)] sm:max-w-[940px]"
              showCloseButton
              variant="info"
            >
              <div className="grid max-h-[calc(100vh-2rem)] overflow-y-auto lg:grid-cols-[0.82fr_1fr]">
                <div className="relative min-h-[310px] bg-transparent lg:min-h-[640px]">
                  <Image
                    alt={member.photoAlt}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 380px, 100vw"
                    src={member.photoSrc}
                  />
                  <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--voyage-deep)]/52 to-transparent" />
                </div>

                <div className="p-6 md:p-8 lg:p-10">
                  <DialogHeader className="gap-0">
                    <p className="kicker-label text-[var(--voyage-deep)]/62">
                      Profil Tutor 2026
                    </p>
                    <div className="mt-4 flex items-start justify-between gap-6">
                      <div>
                        <DialogTitle className="text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-[var(--voyage-deep)] md:text-6xl">
                          {member.name}
                        </DialogTitle>
                        <DialogDescription className="mt-3 text-lg font-semibold text-[var(--voyage-deep)]/70">
                          {member.fullName}
                        </DialogDescription>
                        {member.quote ? (
                          <p className="mt-3 max-w-[36ch] text-sm font-medium italic leading-6 text-[var(--voyage-deep)]/58">
                            &ldquo;{member.quote}&rdquo;
                          </p>
                        ) : null}
                      </div>
                      {member.campusMarkSrc ? (
                        <div className="relative mt-1 hidden size-14 shrink-0 md:block">
                          <Image
                            alt={member.campusMarkAlt ?? `${member.campus} mark`}
                            fill
                            className="object-contain"
                            sizes="56px"
                            src={member.campusMarkSrc}
                          />
                        </div>
                      ) : null}
                    </div>
                  </DialogHeader>

                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    <ProfileFact label="Universitas" value={member.university} />
                    <ProfileFact label="Jurusan" value={member.major} />
                    <ProfileFact label="Nilai UTBK" value={member.utbkScore} />
                    <ProfileFact label="IPK" value={member.gpa} />
                  </div>

                  <div className="mt-9 rounded-3xl border border-[var(--voyage-deep)]/10 bg-white/68 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--voyage-deep)]/52">
                      ACHIEVEMENTS
                    </p>
                    <ul className="mt-5 list-disc space-y-3 pl-5">
                      {member.profileAchievements?.map((achievement) => (
                        <li
                          className="text-base leading-6 text-[var(--voyage-deep)]/78"
                          key={achievement}
                        >
                          {achievement}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ),
      )}
    </div>
  );
}

function ProfileFact({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--voyage-deep)]/10 bg-white/64 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--voyage-deep)]/45">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold leading-6 text-[var(--voyage-deep)]">
        {value}
      </p>
    </div>
  );
}

export { MentorCards };
