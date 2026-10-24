"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { showToast } from "@/components/ui/toast";
import { startQuizAction } from "./actions";
import { QuizResultView, type QuizResult } from "./QuizResultView";

function QuizResultPageModule({
  result,
  quizSlug,
  subjectSlug,
  subjectTitle,
}: {
  result: QuizResult;
  quizSlug: string;
  subjectSlug: string;
  subjectTitle: string;
}) {
  const router = useRouter();
  const restartRequestIdRef = useRef<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);

  async function restartQuiz() {
    if (isRestarting) return;
    setIsRestarting(true);
    setRestartMessage(null);

    try {
      const requestId = restartRequestIdRef.current ?? crypto.randomUUID();
      restartRequestIdRef.current = requestId;
      const response = await startQuizAction(subjectTitle, quizSlug, requestId);
      if (!response.ok) {
        if (response.message.startsWith("Batas percobaan Kuis ini sudah tercapai")) {
          setRestartMessage(response.message);
        } else {
          showToast(response.message, { variant: "error" });
        }
        return;
      }

      router.replace(
        `/quiz/${subjectSlug}/${quizSlug}?attemptId=${encodeURIComponent(response.result.attemptId)}`,
      );
    } catch {
      showToast(
        "Kuis belum berhasil dimulai kembali. Periksa koneksi lalu coba lagi.",
        { variant: "error" },
      );
    } finally {
      setIsRestarting(false);
    }
  }

  return (
    <QuizResultView
      currentQuestion={currentQuestion}
      isRestarting={isRestarting}
      onRestart={() => void restartQuiz()}
      onSelectQuestion={setCurrentQuestion}
      restartMessage={restartMessage}
      result={result}
      subjectSlug={subjectSlug}
    />
  );
}

export { QuizResultPageModule };
