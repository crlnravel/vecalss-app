type MateriDocumentDeliveryMode = "download" | "pdf";

function withMateriDocumentDeliveryMode(value: string, mode: MateriDocumentDeliveryMode) {
  const separator = value.includes("?") ? "&" : "?";
  const query = mode === "download" ? "download=1" : "format=pdf";
  return `${value}${separator}${query}`;
}

export { withMateriDocumentDeliveryMode };
export type { MateriDocumentDeliveryMode };
