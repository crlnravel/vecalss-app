function QuizTimingNote({ status }: { status: "timed" | "untimed" | "unknown" | undefined }) {
  if (status !== "unknown") return null;

  return (
    <p className="mb-4 text-sm leading-relaxed text-secondary-700">
      Batas waktu untuk pengerjaan ini tidak tercatat.
    </p>
  );
}

export { QuizTimingNote };
