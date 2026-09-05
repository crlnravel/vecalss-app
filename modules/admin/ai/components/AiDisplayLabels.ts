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

const IDR_CURRENCY_FORMATTER = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatAiCurrency(value: number) {
  return IDR_CURRENCY_FORMATTER.format(Math.max(0, value));
}
