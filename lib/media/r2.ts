import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { safeDownloadFileName } from "./domain";

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const PREVIEW_URL_TTL_SECONDS = 15 * 60;

type R2Configuration = {
  accessKeyId: string;
  accountId: string;
  bucketName: string;
  secretAccessKey: string;
};

type MediaStorageTestOverrides = {
  createUploadUrl?: (objectKey: string, mimeType: string) => Promise<{
    expiresInSeconds: number;
    uploadUrl: string;
  }>;
  headObject?: (objectKey: string) => Promise<{
    ContentLength?: number;
    ContentType?: string;
    ETag?: string;
  }>;
  readObject?: (objectKey: string, signal?: AbortSignal) => Promise<MediaObjectStream>;
  createPrivateStagingUploadUrl?: (
    objectKey: string,
    contentType: string,
    expiresInSeconds: number,
  ) => Promise<{ expiresInSeconds: number; uploadUrl: string }>;
  putPrivateStagingObject?: (
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
  ) => Promise<void>;
  readPrivateStagingObject?: (
    objectKey: string,
    maxBytes: number,
    signal?: AbortSignal,
  ) => Promise<Uint8Array>;
  deletePrivateStagingObject?: (objectKey: string) => Promise<void>;
  deletePrivateStagingObjects?: (objectKeys: readonly string[]) => Promise<void>;
};

type MediaObjectStream = {
  body: ReadableStream<Uint8Array>;
  contentLength?: number;
  contentType?: string;
};

class PrivateStagingObjectTooLargeError extends Error {
  constructor() {
    super("Objek sementara melebihi batas ukuran.");
    this.name = "PrivateStagingObjectTooLargeError";
  }
}

const PRIVATE_QUESTION_BANK_XLSX_KEY_PATTERN =
  /^question-bank-xlsx-staging\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:workbook\.xlsx|manifest\.json|images\/[0-9a-f]{64}\.bin)$/iu;

function assertPrivateQuestionBankXlsxKey(objectKey: string) {
  if (!PRIVATE_QUESTION_BANK_XLSX_KEY_PATTERN.test(objectKey)) {
    throw new Error("Invalid private staging key.");
  }
}

class R2ConfigurationError extends Error {
  constructor() {
    super("Penyimpanan R2 belum dikonfigurasi.");
    this.name = "R2ConfigurationError";
  }
}

let cachedClient: S3Client | null = null;

let mediaStorageTestOverrides: MediaStorageTestOverrides | null = null;

const readR2Configuration = (): R2Configuration | null => {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  return { accessKeyId, accountId, bucketName, secretAccessKey };
};

const isR2Configured = () => readR2Configuration() !== null;

const getR2Client = () => {
  const configuration = readR2Configuration();

  if (!configuration) {
    throw new R2ConfigurationError();
  }

  cachedClient ??= new S3Client({
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
    endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
    region: "auto",
  });

  return { client: cachedClient, configuration };
};

const createMediaUploadUrlFromR2 = async (objectKey: string, mimeType: string) => {
  const { client, configuration } = getR2Client();
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: configuration.bucketName,
      ContentType: mimeType,
      Key: objectKey,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );

  return { expiresInSeconds: UPLOAD_URL_TTL_SECONDS, uploadUrl };
};

type MediaPreviewUrlOptions = {
  contentDisposition?: "attachment" | "inline";
  fileName?: string | null;
};

const createMediaPreviewUrl = async (
  objectKey: string,
  options: MediaPreviewUrlOptions = {},
) => {
  const { client, configuration } = getR2Client();
  const disposition = options.contentDisposition
    ? `${options.contentDisposition}; filename="${safeDownloadFileName(options.fileName)}"`
    : undefined;

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: configuration.bucketName,
      Key: objectKey,
      ...(disposition ? { ResponseContentDisposition: disposition } : {}),
      ...(options.contentDisposition === "attachment"
        ? { ResponseContentType: "application/pdf" }
        : {}),
    }),
    { expiresIn: PREVIEW_URL_TTL_SECONDS },
  );
};

const readMediaObject = async (objectKey: string) => {
  const { client, configuration } = getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: configuration.bucketName,
      Key: objectKey,
    }),
  );

  if (!response.Body) throw new Error("Objek gambar tidak memiliki isi.");
  return response.Body.transformToByteArray();
};

const readMediaObjectStreamFromR2 = async (
  objectKey: string,
  signal?: AbortSignal,
): Promise<MediaObjectStream> => {
  const { client, configuration } = getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: configuration.bucketName,
      Key: objectKey,
    }),
    signal ? { abortSignal: signal } : undefined,
  );

  if (!response.Body) throw new Error("Objek gambar tidak memiliki isi.");

  return {
    body: response.Body.transformToWebStream(),
    contentLength: response.ContentLength,
    contentType: response.ContentType,
  };
};

const headMediaObjectFromR2 = async (objectKey: string) => {
  const { client, configuration } = getR2Client();

  return client.send(
    new HeadObjectCommand({
      Bucket: configuration.bucketName,
      Key: objectKey,
    }),
  );
};

const createPrivateStagingUploadUrlFromR2 = async (
  objectKey: string,
  contentType: string,
  expiresInSeconds: number,
) => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: configuration.bucketName,
      ContentType: contentType,
      Key: objectKey,
    }),
    { expiresIn: expiresInSeconds },
  );

  return { expiresInSeconds, uploadUrl };
};

const putPrivateStagingObjectFromR2 = async (
  objectKey: string,
  bytes: Uint8Array,
  contentType: string,
) => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  await client.send(new PutObjectCommand({
    Body: bytes,
    Bucket: configuration.bucketName,
    CacheControl: "private, no-store, max-age=0",
    ContentType: contentType,
    Key: objectKey,
  }));
};

const readPrivateStagingObjectFromR2 = async (
  objectKey: string,
  maxBytes: number,
  signal?: AbortSignal,
) => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  const response = await client.send(
    new GetObjectCommand({ Bucket: configuration.bucketName, Key: objectKey }),
    signal ? { abortSignal: signal } : undefined,
  );
  if (response.ContentLength !== undefined && response.ContentLength > maxBytes) {
    await response.Body?.transformToWebStream().cancel().catch(() => undefined);
    throw new PrivateStagingObjectTooLargeError();
  }
  if (!response.Body) throw new Error("Objek sementara tidak memiliki isi.");

  const reader = response.Body.transformToWebStream().getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel(signal.reason);
        throw signal.reason ?? new Error("Pembacaan objek dibatalkan.");
      }
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new PrivateStagingObjectTooLargeError();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  if (response.ContentLength !== undefined && response.ContentLength !== byteLength) {
    throw new Error("Ukuran objek sementara tidak sesuai.");
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const deletePrivateStagingObjectFromR2 = async (objectKey: string) => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: configuration.bucketName, Key: objectKey }));
};

const createMediaUploadUrl = async (objectKey: string, mimeType: string) => (
  mediaStorageTestOverrides?.createUploadUrl?.(objectKey, mimeType)
  ?? createMediaUploadUrlFromR2(objectKey, mimeType)
);

const headMediaObject = async (objectKey: string) => (
  mediaStorageTestOverrides?.headObject?.(objectKey)
  ?? headMediaObjectFromR2(objectKey)
);

const readMediaObjectStream = async (objectKey: string, signal?: AbortSignal) => (
  mediaStorageTestOverrides?.readObject?.(objectKey, signal)
  ?? readMediaObjectStreamFromR2(objectKey, signal)
);

const createPrivateStagingUploadUrl = async (
  objectKey: string,
  contentType: string,
  expiresInSeconds: number,
) => (
  mediaStorageTestOverrides?.createPrivateStagingUploadUrl?.(
    objectKey,
    contentType,
    expiresInSeconds,
  )
  ?? createPrivateStagingUploadUrlFromR2(objectKey, contentType, expiresInSeconds)
);

const putPrivateStagingObject = async (
  objectKey: string,
  bytes: Uint8Array,
  contentType: string,
) => (
  mediaStorageTestOverrides?.putPrivateStagingObject?.(objectKey, bytes, contentType)
  ?? putPrivateStagingObjectFromR2(objectKey, bytes, contentType)
);

const readPrivateStagingObject = async (
  objectKey: string,
  maxBytes: number,
  signal?: AbortSignal,
) => (
  mediaStorageTestOverrides?.readPrivateStagingObject?.(objectKey, maxBytes, signal)
  ?? readPrivateStagingObjectFromR2(objectKey, maxBytes, signal)
);

const deletePrivateStagingObject = async (objectKey: string) => (
  mediaStorageTestOverrides?.deletePrivateStagingObject?.(objectKey)
  ?? deletePrivateStagingObjectFromR2(objectKey)
);

const deletePrivateStagingObjects = async (objectKeys: readonly string[]) => {
  if (objectKeys.length > 1_000) throw new Error("Too many private staging objects to delete.");
  for (const objectKey of objectKeys) assertPrivateQuestionBankXlsxKey(objectKey);
  const override = mediaStorageTestOverrides?.deletePrivateStagingObjects;
  if (override) {
    await override(objectKeys);
    return;
  }
  for (let offset = 0; offset < objectKeys.length; offset += 8) {
    const batch = objectKeys.slice(offset, offset + 8);
    const results = await Promise.allSettled(batch.map(deletePrivateStagingObjectFromR2));
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("Some private staging objects could not be deleted.");
    }
  }
};

/**
 * Test-only storage seam. Production behavior uses Cloudflare R2 unless a
 * focused isolated test installs a temporary override.
 */
async function withMediaStorageTestOverrides<T>(
  overrides: MediaStorageTestOverrides,
  callback: () => Promise<T>,
) {
  const previousOverrides = mediaStorageTestOverrides;
  mediaStorageTestOverrides = overrides;
  try {
    return await callback();
  } finally {
    mediaStorageTestOverrides = previousOverrides;
  }
}

export {
  PREVIEW_URL_TTL_SECONDS,
  R2ConfigurationError,
  PrivateStagingObjectTooLargeError,
  createMediaPreviewUrl,
  createMediaUploadUrl,
  createPrivateStagingUploadUrl,
  deletePrivateStagingObject,
  deletePrivateStagingObjects,
  headMediaObject,
  isR2Configured,
  readMediaObject,
  readMediaObjectStream,
  readPrivateStagingObject,
  putPrivateStagingObject,
  withMediaStorageTestOverrides,
};
export type { MediaObjectStream, MediaPreviewUrlOptions, MediaStorageTestOverrides };
