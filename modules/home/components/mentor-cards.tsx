"use client";

import Image from "next/image";
import { Award, GraduationCap, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import type { CrewMember } from "../data";

type MentorCardsProps = {
  members: CrewMember[];
};

function MentorCards({ members }: MentorCardsProps) {
  const [activeMentor, setActiveMentor] = useState<CrewMember | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!activeMentor) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveMentor(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeMentor]);

  return (
    <>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member, index) =>
          member.isEmpty ? (
            <article
              aria-hidden="true"
              className="min-h-[402px] overflow-hidden rounded-[24px] border border-dashed border-[#014C38]/14 bg-[#014C38]/[0.025]"
              key={member.id}
            />
          ) : (
            <button
              aria-label={`Lihat profil ${member.name}`}
              className="group overflow-hidden rounded-[24px] border border-[#014C38]/10 bg-white text-left transition duration-300 hover:-translate-y-1 hover:border-[#014C38]/22 hover:shadow-[0_34px_90px_-72px_rgba(1,76,56,0.55)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#014C38]/18"
              key={member.id}
              onClick={() => setActiveMentor(member)}
              type="button"
            >
              <div className="relative aspect-[1/1] bg-[#014C38]/[0.035]">
                <Image
                  alt={member.photoAlt}
                  fill
                  className="object-cover transition duration-500 group-hover:scale-[1.035]"
                  priority={index < 2}
                  sizes="(min-width: 1024px) 33vw, 50vw"
                  src={member.photoSrc}
                />
                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#014C38]/36 to-transparent" />
                <span className="absolute bottom-4 left-4 rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold text-[#014C38] shadow-[0_18px_46px_-30px_rgba(1,76,56,0.68)]">
                  View profile
                </span>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[26px] font-semibold leading-tight tracking-[-0.03em] text-[#014C38]">
                      {member.name}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-[#014C38]/62">
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
            </button>
          ),
        )}
      </div>

      {activeMentor ? (
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#012d22]/72 px-4 py-6 backdrop-blur-sm"
          onClick={() => setActiveMentor(null)}
          role="dialog"
        >
          <div
            className="relative grid max-h-[calc(100vh-48px)] w-full max-w-[920px] overflow-hidden rounded-[28px] border border-white/24 bg-[#fbf8ef] shadow-[0_32px_110px_-46px_rgba(0,0,0,0.6)] lg:grid-cols-[0.82fr_1fr]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Tutup profil tutor"
              className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full border border-[#014C38]/12 bg-white/92 text-[#014C38] transition hover:bg-[#014C38] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#014C38]/18"
              onClick={() => setActiveMentor(null)}
              type="button"
            >
              <X className="size-4" />
            </button>

            <div className="relative min-h-[320px] bg-[#014C38]/[0.035] lg:min-h-[640px]">
              <Image
                alt={activeMentor.photoAlt}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 380px, 100vw"
                src={activeMentor.photoSrc}
              />
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#014C38]/52 to-transparent" />
            </div>

            <div className="overflow-y-auto p-6 md:p-8 lg:p-10">
              <p className="kicker-label text-[#014C38]/62">
                Tutor Profile 2026
              </p>
              <div className="mt-4 flex items-start justify-between gap-6">
                <div>
                  <h3
                    className="text-[38px] font-semibold leading-[0.98] tracking-[-0.045em] text-[#014C38] md:text-[54px]"
                    id={titleId}
                  >
                    {activeMentor.name}
                  </h3>
                  <p className="mt-3 text-[17px] font-semibold text-[#014C38]/70">
                    {activeMentor.fullName}
                  </p>
                </div>
                {activeMentor.campusMarkSrc ? (
                  <div className="relative mt-1 hidden size-14 shrink-0 md:block">
                    <Image
                      alt={activeMentor.campusMarkAlt ?? `${activeMentor.campus} mark`}
                      fill
                      className="object-contain"
                      sizes="56px"
                      src={activeMentor.campusMarkSrc}
                    />
                  </div>
                ) : null}
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <ProfileFact label="University" value={activeMentor.university} />
                <ProfileFact label="Major" value={activeMentor.major} />
                <ProfileFact label="UTBK Score" value={activeMentor.utbkScore} />
                <ProfileFact label="GPA" value={activeMentor.gpa} />
              </div>

              <div className="mt-9 rounded-[22px] border border-[#014C38]/10 bg-white/68 p-5">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-[#014C38] text-white">
                    <Award className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#014C38]/52">
                      Achievements
                    </p>
                    <p className="mt-1 text-sm text-[#014C38]/62">
                      Rekam jejak akademik dan aktivitas pilihan.
                    </p>
                  </div>
                </div>

                <ul className="mt-5 space-y-3">
                  {activeMentor.profileAchievements?.map((achievement) => (
                    <li
                      className="flex gap-3 text-[15px] leading-6 text-[#014C38]/78"
                      key={achievement}
                    >
                      <GraduationCap className="mt-1 size-4 shrink-0 text-[#014C38]/58" />
                      <span>{achievement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
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
    <div className="rounded-[18px] border border-[#014C38]/10 bg-white/64 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#014C38]/45">
        {label}
      </p>
      <p className="mt-2 text-[16px] font-semibold leading-6 text-[#014C38]">
        {value}
      </p>
    </div>
  );
}

export { MentorCards };
