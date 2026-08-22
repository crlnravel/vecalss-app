type LiveState =
  | "cat_failure"
  | "checked_in"
  | "disconnected"
  | "in_progress"
  | "needs_attention"
  | "registered"
  | "submitted";

type LiveSeverity = "attention" | "critical" | "neutral";

type LiveAttemptInput = {
  attemptId?: string | null;
  attemptState: string;
  disconnectStartedAt?: string | null;
  integrityEvents?: number;
  reconciledAt?: string | null;
  scoringReviewReason?: string | null;
  scoringState: string;
  status: string;
  runs: ReadonlyArray<{
    catFailureReason?: string | null;
    catState: string;
    integrityEvents?: number;
    remainingSeconds?: number | null;
    scoringReviewReason?: string | null;
    scoringState: string;
    sequenceNo: number;
    status: string;
  }>;
};

type LiveProjection = {
  activeRunSequenceNo: number | null;
  attemptId: string | null;
  catFailureSequenceNo: number | null;
  integrityEventCount: number;
  label: string;
  reason: string;
  severity: LiveSeverity;
  state: LiveState;
};

type ResultReadiness = "not_started" | "review_required" | "scored" | "scoring_pending";
type ResultReleaseState = "hidden" | "released" | "scheduled";
type RankingAvailability = "available" | "pending" | "unavailable";

type ResultAttemptInput = {
  attemptId?: string | null;
  attemptState: string;
  releaseReady?: boolean;
  releaseState: string;
  score: string | null;
  scoringReviewReason?: string | null;
  scoringState: string;
  status: string;
  runs: ReadonlyArray<{
    calculationReleaseable?: boolean;
    catFailureReason?: string | null;
    catState: string;
    scoringReviewReason?: string | null;
    scoringState: string;
    status: string;
  }>;
};

type ResultSessionInput = {
  eligibleRankingAttempts?: number;
  rankingRule: string;
  releaseState: string;
};

type ResultProjection = {
  attemptId: string | null;
  displayScore: string | null;
  rankingAvailability: RankingAvailability;
  releaseState: ResultReleaseState;
  resultReadiness: ResultReadiness;
  reviewReason: string | null;
  scoreVisible: boolean;
};

const liveStateLabels: Record<LiveState, string> = {
  cat_failure: "CAT gagal",
  checked_in: "Sudah check-in",
  disconnected: "Terputus",
  in_progress: "Berlangsung",
  needs_attention: "Perlu perhatian",
  registered: "Terdaftar",
  submitted: "Terkirim",
};

const resultReadinessLabels: Record<ResultReadiness, string> = {
  not_started: "Belum mulai",
  review_required: "Perlu review",
  scored: "Sudah dinilai",
  scoring_pending: "Menunggu penilaian",
};

const resultReleaseStateLabels: Record<ResultReleaseState, string> = {
  hidden: "Tersembunyi",
  released: "Dirilis",
  scheduled: "Terjadwal",
};

const rankingAvailabilityLabels: Record<RankingAvailability, string> = {
  available: "Peringkat tersedia",
  pending: "Peringkat menunggu rilis",
  unavailable: "Peringkat tidak tersedia",
};

function deriveTryoutLiveProjection(input: {
  admissionStatus: string;
  attempt?: LiveAttemptInput | null;
  sessionState?: string | null;
}): LiveProjection {
  const attempt = input.attempt ?? null;
  if (!attempt) {
    return {
      activeRunSequenceNo: null,
      attemptId: null,
      catFailureSequenceNo: null,
      integrityEventCount: 0,
      label: liveStateLabels.registered,
      reason: input.admissionStatus === "pending"
        ? "Registrasi menunggu keputusan Kapten; belum ada attempt."
        : input.sessionState === "assigned"
          ? "Peserta terdaftar dan sudah mendapat jadwal, tetapi belum check-in."
          : "Peserta terdaftar, tetapi belum memiliki attempt.",
      severity: "neutral",
      state: "registered",
    };
  }

  const integrityEventCount = (attempt.integrityEvents ?? 0)
    + attempt.runs.reduce((total, run) => total + (run.integrityEvents ?? 0), 0);
  const activeRun = attempt.runs.find((run) => run.status === "active") ?? null;
  const activeRunExpired = typeof activeRun?.remainingSeconds === "number" && activeRun.remainingSeconds <= 0;
  const failedCatRun = attempt.runs.find((run) => run.catState === "failed") ?? null;
  const activeDisconnect = Boolean(attempt.disconnectStartedAt && !attempt.reconciledAt);
  const reviewRun = attempt.runs.find((run) => run.scoringState === "review_required") ?? null;
  const reviewRequired = attempt.scoringState === "review_required" || Boolean(reviewRun);
  const terminal = ["submitted", "auto_submitted", "expired"].includes(attempt.attemptState)
    || ["submitted", "auto_submitted", "expired"].includes(attempt.status);

  if (activeDisconnect) {
    return {
      activeRunSequenceNo: activeRun?.sequenceNo ?? null,
      attemptId: attempt.attemptId ?? null,
      catFailureSequenceNo: failedCatRun?.sequenceNo ?? null,
      integrityEventCount,
      label: liveStateLabels.disconnected,
      reason: "Koneksi peserta masih terputus; periksa attempt secara manual sebelum mengambil tindakan.",
      severity: "critical",
      state: "disconnected",
    };
  }

  if (failedCatRun) {
    return {
      activeRunSequenceNo: activeRun?.sequenceNo ?? null,
      attemptId: attempt.attemptId ?? null,
      catFailureSequenceNo: failedCatRun.sequenceNo,
      integrityEventCount,
      label: liveStateLabels.cat_failure,
      reason: failedCatRun.catFailureReason ?? `CAT gagal pada Test ${failedCatRun.sequenceNo}; buka attempt untuk review atau resolusi.`,
      severity: "critical",
      state: "cat_failure",
    };
  }

  if (reviewRequired || integrityEventCount > 0) {
    return {
      activeRunSequenceNo: activeRun?.sequenceNo ?? null,
      attemptId: attempt.attemptId ?? null,
      catFailureSequenceNo: null,
      integrityEventCount,
      label: liveStateLabels.needs_attention,
      reason: attempt.scoringReviewReason
        ?? reviewRun?.scoringReviewReason
        ?? `Ada ${integrityEventCount} sinyal integritas untuk review manusia; tidak ada konsekuensi otomatis.`,
      severity: "attention",
      state: "needs_attention",
    };
  }

  if (terminal) {
    return {
      activeRunSequenceNo: null,
      attemptId: attempt.attemptId ?? null,
      catFailureSequenceNo: null,
      integrityEventCount,
      label: liveStateLabels.submitted,
      reason: attempt.attemptState === "expired"
        ? "Attempt berakhir karena waktu; status tetap dapat ditinjau dari detail attempt."
        : "Attempt sudah dikirim dan menunggu atau telah melewati tahap rilis hasil.",
      severity: "neutral",
      state: "submitted",
    };
  }

  if (activeRunExpired) {
    return {
      activeRunSequenceNo: activeRun?.sequenceNo ?? null,
      attemptId: attempt.attemptId ?? null,
      catFailureSequenceNo: null,
      integrityEventCount,
      label: liveStateLabels.needs_attention,
      reason: `Timer Test ${activeRun?.sequenceNo ?? "aktif"} sudah mencapai batas; verifikasi attempt dari detail sebelum mengambil tindakan.`,
      severity: "attention",
      state: "needs_attention",
    };
  }

  if (activeRun || attempt.attemptState === "in_progress" || attempt.status === "in_progress") {
    return {
      activeRunSequenceNo: activeRun?.sequenceNo ?? null,
      attemptId: attempt.attemptId ?? null,
      catFailureSequenceNo: null,
      integrityEventCount,
      label: liveStateLabels.in_progress,
      reason: activeRun
        ? `Peserta sedang mengerjakan Test ${activeRun.sequenceNo}.`
        : "Attempt masih berjalan dan menunggu Test aktif berikutnya.",
      severity: "neutral",
      state: "in_progress",
    };
  }

  return {
    activeRunSequenceNo: null,
    attemptId: attempt.attemptId ?? null,
    catFailureSequenceNo: null,
    integrityEventCount,
    label: liveStateLabels.checked_in,
    reason: "Attempt sudah dibuat; peserta belum memiliki Test aktif.",
    severity: "neutral",
    state: "checked_in",
  };
}

function deriveTryoutResultProjection(input: {
  attempt?: ResultAttemptInput | null;
  session: ResultSessionInput;
}): ResultProjection {
  const attempt = input.attempt ?? null;
  if (!attempt) {
    return {
      attemptId: null,
      displayScore: null,
      rankingAvailability: input.session.rankingRule === "none" ? "unavailable" : "pending",
      releaseState: input.session.releaseState === "scheduled" ? "scheduled" : "hidden",
      resultReadiness: "not_started",
      reviewReason: null,
      scoreVisible: false,
    };
  }

  const reviewRun = attempt.runs.find((run) =>
    run.scoringState === "review_required"
      || run.catState === "failed"
      || run.catState === "voided"
      || run.scoringReviewReason,
  ) ?? null;
  const resultReadiness: ResultReadiness = attempt.scoringState === "review_required" || reviewRun
    ? "review_required"
    : attempt.scoringState === "scored" && attempt.score !== null && attempt.releaseReady === true
      ? "scored"
      : "scoring_pending";
  const releaseState: ResultReleaseState = input.session.releaseState === "hidden"
    || attempt.releaseState === "hidden"
    ? "hidden"
    : input.session.releaseState === "released"
      && attempt.releaseState === "released"
      ? "released"
      : "scheduled";
  const scoreVisible = releaseState === "released" && resultReadiness === "scored";
  const rankingAvailability: RankingAvailability = input.session.rankingRule === "none"
    ? "unavailable"
    : !scoreVisible
      ? "pending"
      : (input.session.eligibleRankingAttempts ?? 0) >= 2
        ? "available"
        : "unavailable";

  return {
    attemptId: attempt.attemptId ?? null,
    displayScore: scoreVisible ? attempt.score : null,
    rankingAvailability,
    releaseState,
    resultReadiness,
    reviewReason: attempt.scoringReviewReason
      ?? reviewRun?.scoringReviewReason
      ?? reviewRun?.catFailureReason
      ?? null,
    scoreVisible,
  };
}

export {
  deriveTryoutLiveProjection,
  deriveTryoutResultProjection,
  liveStateLabels,
  rankingAvailabilityLabels,
  resultReadinessLabels,
  resultReleaseStateLabels,
};
export type {
  LiveAttemptInput,
  LiveProjection,
  LiveSeverity,
  LiveState,
  RankingAvailability,
  ResultAttemptInput,
  ResultProjection,
  ResultReadiness,
  ResultReleaseState,
};
