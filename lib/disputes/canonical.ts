import { createHash } from "node:crypto";

/**
 * A stable text form of a JSON value: object keys sorted, no whitespace,
 * arrays in order. The same data always gives the same bytes, so a SHA-256
 * over it detects any later change to the packet.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("A packet cannot hold a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item === undefined ? null : item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  throw new Error("A packet can only hold JSON values.");
}

function sha256Hex(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const DIGEST_METHOD = "sha256-over-sorted-key-json";

type PacketFile = {
  digest: { method: string; sha256: string };
  packet: Record<string, unknown>;
};

/** Wraps a packet with the digest of its canonical form. */
function sealPacket(packet: Record<string, unknown>): PacketFile {
  // Round-trip first, so the digest covers exactly what a reader will parse.
  const plain = JSON.parse(JSON.stringify(packet)) as Record<string, unknown>;
  return { digest: { method: DIGEST_METHOD, sha256: sha256Hex(canonicalize(plain)) }, packet: plain };
}

/** True when the file's packet still hashes to the digest it carries. */
function verifyPacketFile(fileText: string) {
  try {
    const file = JSON.parse(fileText) as Partial<PacketFile>;
    if (!file || typeof file !== "object" || !file.packet || file.digest?.method !== DIGEST_METHOD) return false;
    return sha256Hex(canonicalize(file.packet)) === file.digest.sha256;
  } catch {
    return false;
  }
}

export { DIGEST_METHOD, canonicalize, sealPacket, sha256Hex, verifyPacketFile };
export type { PacketFile };
