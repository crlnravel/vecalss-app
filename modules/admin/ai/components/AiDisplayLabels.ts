const FEATURE_LABELS: Record<string, string> = {
  "vera.chat": "Chat Vera",
  "vera.drill": "Latihan soal",
  "vera.review": "Review jawaban",
  "vera.analysis": "Analisis belajar",
  "vera.ptn": "Rekomendasi PTN",
  "vera.route": "Rute belajar",
  "vera.summary": "Ringkasan belajar",
};

export function formatAiFeatureLabel(value: string) {
  return (
    FEATURE_LABELS[value] ??
    value
      .replace(/^vera[._-]/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function formatAiCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, value));
}
