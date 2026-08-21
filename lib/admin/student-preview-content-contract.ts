/**
 * Pure content boundaries shared by preview read DTOs and contract tests.
 * Stored learning text is rendered as text (never injected as HTML), and only
 * known video providers are allowed to reach an iframe renderer.
 */

import type { MateriVideo } from "@/lib/materi/contract";

function sanitizePreviewText(value: string | null | undefined) {
  if (typeof value !== "string") return "";

  return value
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<\s*(script|style|iframe|object|embed|svg)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/giu, "")
    .replace(/<[^>]*>/gu, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function sanitizePreviewFileName(value: string | null | undefined) {
  const sanitized = sanitizePreviewText(value).replace(/[\\/]/gu, "-").trim();
  return sanitized ? sanitized.slice(0, 255) : null;
}

function sanitizePreviewVideo(value: string | null | undefined): MateriVideo | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;

    const host = url.hostname.toLowerCase().replace(/^www\./u, "");
    const pathParts = url.pathname.split("/").filter(Boolean);
    const isYoutube = ["youtube.com", "m.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host);
    const isVimeo = host === "vimeo.com" || host === "player.vimeo.com";
    if (!isYoutube && !isVimeo) return null;

    const videoId = isYoutube
      ? host === "youtu.be"
        ? pathParts[0]
        : url.searchParams.get("v")
          ?? (pathParts[0] === "embed" || pathParts[0] === "shorts" || pathParts[0] === "live" ? pathParts[1] : undefined)
      : host === "player.vimeo.com" && pathParts[0] === "video"
        ? pathParts[1]
        : pathParts[0];

    if (!videoId || !/^[A-Za-z0-9_-]{2,160}$/u.test(videoId)) return null;

    return { durationSeconds: 0, mediaUrl: value.trim() };
  } catch {
    return null;
  }
}

export {
  sanitizePreviewFileName,
  sanitizePreviewText,
  sanitizePreviewVideo,
};
