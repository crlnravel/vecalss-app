type ReportAttachmentResponseMode = "download" | "preview";

type ReportAttachmentResponseMetadata = {
  contentType: string;
  fileName: string;
};

function contentDispositionForAttachment(fileName: string, mode: ReportAttachmentResponseMode) {
  const asciiName = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/gu, "_")
    .replace(/[\\";/]/gu, "_")
    .replace(/[\r\n]/gu, "_")
    .slice(0, 180) || "lampiran";
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/gu, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  const disposition = mode === "preview" ? "inline" : "attachment";

  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

function createReportAttachmentResponse(
  bytes: Uint8Array,
  attachment: ReportAttachmentResponseMetadata,
  mode: ReportAttachmentResponseMode,
) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": contentDispositionForAttachment(attachment.fileName, mode),
      "Content-Length": String(bytes.byteLength),
      "Content-Type": attachment.contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}

export { contentDispositionForAttachment, createReportAttachmentResponse };
export type { ReportAttachmentResponseMode };
