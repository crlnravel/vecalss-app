import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";

import { sha256Hex } from "./contracts";

export type AiEncryptedPayload = {
  cipherVersion: "aes-256-gcm-v1";
  keyRef: string;
  wrappedDek: string;
  nonceOrIv: string;
  authenticationTag: string;
  ciphertext: string;
  plaintextBytes: number;
  plaintextDigest: string;
};

export interface EnvelopeKeyRegistry {
  createObjectKey(objectId?: string): string;
  wrapDataKey(keyRef: string, dataKey: Uint8Array): string;
  unwrapDataKey(keyRef: string, wrappedDataKey: string): Buffer;
  destroyObjectKey(keyRef: string): void;
  rotateObjectKey(keyRef: string): string;
}

export interface AsyncEnvelopeKeyRegistry {
  createObjectKey(objectId?: string): Promise<string>;
  wrapDataKey(keyRef: string, dataKey: Uint8Array): Promise<string>;
  unwrapDataKey(keyRef: string, wrappedDataKey: string): Promise<Buffer>;
  destroyObjectKey(keyRef: string): Promise<void>;
  rotateObjectKey(keyRef: string): Promise<string>;
}

export type EnvelopeRootKeyProvider = () => Uint8Array | Promise<Uint8Array>;

type EnvelopeDb = Pick<PrismaClient, "aiEnvelopeKey">;

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeError";
  }
}

function assertKey(key: Uint8Array): Buffer {
  if (key.byteLength !== 32) throw new EnvelopeError("Envelope keys must be 256-bit.");
  return Buffer.from(key);
}

function wrapWithKey(key: Buffer, value: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

function unwrapWithKey(key: Buffer, value: string): Buffer {
  const [ivEncoded, tagEncoded, ciphertextEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new EnvelopeError("The wrapped data key is malformed.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivEncoded, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]);
  } catch {
    throw new EnvelopeError("The wrapped data key cannot be authenticated.");
  }
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

/**
 * Test/demonstration registry. Production KMS wiring can implement the same
 * interface without allowing the envelope contract to leak into callers.
 */
export class InMemoryEnvelopeKeyRegistry implements EnvelopeKeyRegistry {
  private readonly keys = new Map<string, Buffer>();
  private readonly objectIds = new Map<string, string>();
  private counter = 0;

  createObjectKey(objectId = "object"): string {
    const keyRef = `${objectId}:${++this.counter}:${randomBytes(8).toString("hex")}`;
    this.keys.set(keyRef, randomBytes(32));
    this.objectIds.set(keyRef, objectId);
    return keyRef;
  }

  wrapDataKey(keyRef: string, dataKey: Uint8Array): string {
    const key = this.keys.get(keyRef);
    if (!key) throw new EnvelopeError("The envelope key is unavailable.");
    return wrapWithKey(key, assertKey(dataKey));
  }

  unwrapDataKey(keyRef: string, wrappedDataKey: string): Buffer {
    const key = this.keys.get(keyRef);
    if (!key) throw new EnvelopeError("The envelope key was destroyed or is unavailable.");
    return unwrapWithKey(key, wrappedDataKey);
  }

  destroyObjectKey(keyRef: string): void {
    const objectId = this.objectIds.get(keyRef);
    for (const [candidate, candidateObjectId] of this.objectIds) {
      if (candidate === keyRef || (objectId !== undefined && candidateObjectId === objectId)) {
        this.keys.delete(candidate);
        this.objectIds.delete(candidate);
      }
    }
  }

  rotateObjectKey(keyRef: string): string {
    const oldKey = this.keys.get(keyRef);
    if (!oldKey) throw new EnvelopeError("The envelope key was destroyed or is unavailable.");
    const objectId = this.objectIds.get(keyRef);
    if (!objectId) throw new EnvelopeError("The envelope object identity is unavailable.");
    const nextRef = this.createObjectKey(objectId);
    // Keep the old key available until the caller rewraps and commits the
    // rotated envelope; destruction remains an explicit purge operation.
    void oldKey;
    return nextRef;
  }
}

/**
 * Durable registry for production envelopes. The root-key provider is the
 * KMS boundary (the local environment provider is only a deployment adapter);
 * the database stores only root-key-wrapped DEKs and immutable key identity.
 * Async methods keep Prisma writes in the same transaction when callers use
 * `EnvelopeService.forClient(tx)`.
 */
export class PrismaKmsEnvelopeKeyRegistry implements AsyncEnvelopeKeyRegistry {
  constructor(
    private readonly db: EnvelopeDb,
    private readonly rootKeyProvider: EnvelopeRootKeyProvider,
  ) {}

  withClient(db: EnvelopeDb): PrismaKmsEnvelopeKeyRegistry {
    return new PrismaKmsEnvelopeKeyRegistry(db, this.rootKeyProvider);
  }

  async createObjectKey(objectId = "object"): Promise<string> {
    const keyRef = `${objectId}:envelope:${randomBytes(16).toString("hex")}`;
    const rootKey = await this.rootKey();
    const wrappedKeyMaterial = wrapWithKey(rootKey, randomBytes(32));
    await this.db.aiEnvelopeKey.create({
      data: {
        keyRef,
        objectId,
        wrappedKeyMaterial,
        cipherVersion: "aes-256-gcm-v1",
        state: "active",
      },
    });
    return keyRef;
  }

  async wrapDataKey(keyRef: string, dataKey: Uint8Array): Promise<string> {
    return wrapWithKey(await this.loadKey(keyRef), assertKey(dataKey));
  }

  async unwrapDataKey(keyRef: string, wrappedDataKey: string): Promise<Buffer> {
    return unwrapWithKey(await this.loadKey(keyRef), wrappedDataKey);
  }

  async destroyObjectKey(keyRef: string): Promise<void> {
    await this.db.aiEnvelopeKey.updateMany({
      where: { keyRef, state: "active" },
      data: { state: "destroyed", destroyedAt: new Date() },
    });
  }

  async rotateObjectKey(keyRef: string): Promise<string> {
    const row = await this.db.aiEnvelopeKey.findUnique({ where: { keyRef }, select: { objectId: true } });
    if (!row) throw new EnvelopeError("The envelope key was destroyed or is unavailable.");
    return this.createObjectKey(row.objectId);
  }

  private async loadKey(keyRef: string): Promise<Buffer> {
    const row = await this.db.aiEnvelopeKey.findUnique({
      where: { keyRef },
      select: { wrappedKeyMaterial: true, cipherVersion: true, state: true },
    });
    if (!row || row.state !== "active") throw new EnvelopeError("The envelope key was destroyed or is unavailable.");
    if (row.cipherVersion !== "aes-256-gcm-v1") throw new EnvelopeError("Unknown envelope key cipher version.");
    return unwrapWithKey(await this.rootKey(), row.wrappedKeyMaterial);
  }

  private async rootKey(): Promise<Buffer> {
    return assertKey(await this.rootKeyProvider());
  }
}

export function environmentEnvelopeRootKeyProvider(): EnvelopeRootKeyProvider {
  return () => {
    const configured = process.env.VERA_ENVELOPE_MASTER_KEY?.trim();
    if (!configured) throw new EnvelopeError("Vera envelope root-key provider is not configured.");
    const decoded = Buffer.from(configured, "base64url");
    if (decoded.byteLength === 32) return decoded;
    const hex = Buffer.from(configured, "hex");
    if (hex.byteLength === 32) return hex;
    throw new EnvelopeError("Vera envelope root-key provider returned an invalid key.");
  };
}

export class EnvelopeService {
  constructor(private readonly registry: EnvelopeKeyRegistry | AsyncEnvelopeKeyRegistry) {}

  forClient(db: EnvelopeDb): EnvelopeService {
    if (this.registry instanceof PrismaKmsEnvelopeKeyRegistry) return new EnvelopeService(this.registry.withClient(db));
    return this;
  }

  encrypt(value: Uint8Array | string, objectId = "vera-content"): AiEncryptedPayload {
    const registry = this.registry as EnvelopeKeyRegistry;
    const plaintext = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
    const dataKey = randomBytes(32);
    // `objectId` is only a caller-owned namespace. Every encrypted envelope
    // receives its own registry identity so purging one envelope cannot
    // destroy a sibling that uses the default namespace.
    const envelopeObjectId = `${objectId}:envelope:${randomBytes(16).toString("hex")}`;
    const keyRef = registry.createObjectKey(envelopeObjectId);
    if (isPromiseLike(keyRef)) throw new EnvelopeError("Use encryptAsync with a durable envelope registry.");
    const wrappedDek = registry.wrapDataKey(keyRef, dataKey);
    if (isPromiseLike(wrappedDek)) throw new EnvelopeError("Use encryptAsync with a durable envelope registry.");
    return this.encryptWithDataKey(plaintext, keyRef, wrappedDek, dataKey);
  }

  async encryptAsync(value: Uint8Array | string, objectId = "vera-content"): Promise<AiEncryptedPayload> {
    const plaintext = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
    const dataKey = randomBytes(32);
    const envelopeObjectId = `${objectId}:envelope:${randomBytes(16).toString("hex")}`;
    const keyRef = await (this.registry as EnvelopeKeyRegistry | AsyncEnvelopeKeyRegistry).createObjectKey(envelopeObjectId);
    const wrappedDek = await (this.registry as EnvelopeKeyRegistry | AsyncEnvelopeKeyRegistry).wrapDataKey(keyRef, dataKey);
    return this.encryptWithDataKey(plaintext, keyRef, wrappedDek, dataKey);
  }

  private encryptWithDataKey(plaintext: Buffer, keyRef: string, wrappedDek: string, dataKey: Buffer): AiEncryptedPayload {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dataKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return {
      cipherVersion: "aes-256-gcm-v1",
      keyRef,
      wrappedDek,
      nonceOrIv: nonce.toString("base64url"),
      authenticationTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      plaintextBytes: plaintext.byteLength,
      plaintextDigest: sha256Hex(plaintext),
    };
  }

  decrypt(envelope: AiEncryptedPayload, lifecycleState: "available" | "purging" | "purged" = "available"): Buffer {
    if (lifecycleState !== "available") throw new EnvelopeError("Content is not available for reconstruction.");
    if (envelope.cipherVersion !== "aes-256-gcm-v1") throw new EnvelopeError("Unknown envelope cipher version.");

    const dataKey = (this.registry as EnvelopeKeyRegistry).unwrapDataKey(envelope.keyRef, envelope.wrappedDek);
    if (isPromiseLike(dataKey)) throw new EnvelopeError("Use decryptAsync with a durable envelope registry.");
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        assertKey(dataKey),
        Buffer.from(envelope.nonceOrIv, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(envelope.authenticationTag, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]);
      if (plaintext.byteLength !== envelope.plaintextBytes) throw new EnvelopeError("Envelope byte count mismatch.");
      if (createHash("sha256").update(plaintext).digest("hex") !== envelope.plaintextDigest) {
        throw new EnvelopeError("Envelope plaintext digest mismatch.");
      }
      return plaintext;
    } catch (error) {
      if (error instanceof EnvelopeError) throw error;
      throw new EnvelopeError("Envelope authentication failed.");
    }
  }

  decryptText(envelope: AiEncryptedPayload, lifecycleState?: "available" | "purging" | "purged"): string {
    return this.decrypt(envelope, lifecycleState).toString("utf8");
  }

  async decryptAsync(envelope: AiEncryptedPayload, lifecycleState: "available" | "purging" | "purged" = "available"): Promise<Buffer> {
    if (lifecycleState !== "available") throw new EnvelopeError("Content is not available for reconstruction.");
    if (envelope.cipherVersion !== "aes-256-gcm-v1") throw new EnvelopeError("Unknown envelope cipher version.");
    const dataKey = await (this.registry as EnvelopeKeyRegistry | AsyncEnvelopeKeyRegistry).unwrapDataKey(envelope.keyRef, envelope.wrappedDek);
    return this.decryptWithDataKey(envelope, dataKey);
  }

  async decryptTextAsync(envelope: AiEncryptedPayload, lifecycleState: "available" | "purging" | "purged" = "available"): Promise<string> {
    return (await this.decryptAsync(envelope, lifecycleState)).toString("utf8");
  }

  private decryptWithDataKey(envelope: AiEncryptedPayload, dataKey: Buffer): Buffer {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        assertKey(dataKey),
        Buffer.from(envelope.nonceOrIv, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(envelope.authenticationTag, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]);
      if (plaintext.byteLength !== envelope.plaintextBytes) throw new EnvelopeError("Envelope byte count mismatch.");
      if (createHash("sha256").update(plaintext).digest("hex") !== envelope.plaintextDigest) {
        throw new EnvelopeError("Envelope plaintext digest mismatch.");
      }
      return plaintext;
    } catch (error) {
      if (error instanceof EnvelopeError) throw error;
      throw new EnvelopeError("Envelope authentication failed.");
    }
  }

  rotate(envelope: AiEncryptedPayload): AiEncryptedPayload {
    const registry = this.registry as EnvelopeKeyRegistry;
    const oldKey = registry.unwrapDataKey(envelope.keyRef, envelope.wrappedDek);
    const nextRef = registry.rotateObjectKey(envelope.keyRef);
    if (isPromiseLike(oldKey) || isPromiseLike(nextRef)) throw new EnvelopeError("Use rotateAsync with a durable envelope registry.");
    const wrappedDek = registry.wrapDataKey(nextRef, oldKey);
    if (isPromiseLike(wrappedDek)) throw new EnvelopeError("Use rotateAsync with a durable envelope registry.");
    return {
      ...envelope,
      keyRef: nextRef,
      wrappedDek,
    };
  }

  async rotateAsync(envelope: AiEncryptedPayload): Promise<AiEncryptedPayload> {
    const registry = this.registry as EnvelopeKeyRegistry | AsyncEnvelopeKeyRegistry;
    const [oldKey, nextRef] = await Promise.all([
      registry.unwrapDataKey(envelope.keyRef, envelope.wrappedDek),
      registry.rotateObjectKey(envelope.keyRef),
    ]);
    return {
      ...envelope,
      keyRef: nextRef,
      wrappedDek: await registry.wrapDataKey(nextRef, oldKey),
    };
  }

  purge(envelope: AiEncryptedPayload): void {
    const result = (this.registry as EnvelopeKeyRegistry).destroyObjectKey(envelope.keyRef);
    if (isPromiseLike(result)) throw new EnvelopeError("Use purgeAsync with a durable envelope registry.");
  }

  async purgeAsync(envelope: AiEncryptedPayload): Promise<void> {
    await (this.registry as EnvelopeKeyRegistry | AsyncEnvelopeKeyRegistry).destroyObjectKey(envelope.keyRef);
  }
}
