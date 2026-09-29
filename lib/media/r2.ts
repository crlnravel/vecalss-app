import "server-only";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
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
  headObject?: (objectKey: string, signal?: AbortSignal) => Promise<{
    ContentLength?: number;
    ContentType?: string;
    ETag?: string;
    Metadata?: Record<string, string>;
  }>;
  readObject?: (objectKey: string, signal?: AbortSignal) => Promise<MediaObjectStream>;
  createPrivateStagingUploadUrl?: (
    objectKey: string,
    contentType: string,
    expiresInSeconds: number,
  ) => Promise<{ expiresInSeconds: number; uploadUrl: string }>;
  createPrivateStagingMultipartUpload?: (
    objectKey: string,
    contentType: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  createPrivateStagingUploadPartUrl?: (
    objectKey: string,
    uploadId: string,
    partNumber: number,
    contentLength: number,
    expiresInSeconds: number,
  ) => Promise<{ expiresInSeconds: number; uploadUrl: string }>;
  listPrivateStagingMultipartParts?: (
    objectKey: string,
    uploadId: string,
    signal?: AbortSignal,
  ) => Promise<PrivateStagingMultipartPart[]>;
  listPrivateStagingMultipartUploads?: (
    objectKey: string,
    signal?: AbortSignal,
  ) => Promise<PrivateStagingMultipartUpload[]>;
  completePrivateStagingMultipartUpload?: (
    objectKey: string,
    uploadId: string,
    parts: readonly CompletedPart[],
    signal?: AbortSignal,
  ) => Promise<void>;
  abortPrivateStagingMultipartUpload?: (
    objectKey: string,
    uploadId: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  putPrivateStagingObject?: (
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  readPrivateStagingObject?: (
    objectKey: string,
    maxBytes: number,
    signal?: AbortSignal,
  ) => Promise<Uint8Array>;
  deletePrivateStagingObject?: (objectKey: string, signal?: AbortSignal) => Promise<void>;
  deletePrivateStagingObjects?: (objectKeys: readonly string[], signal?: AbortSignal) => Promise<void>;
  putPrivateReportAttachment?: (
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  readPrivateReportAttachment?: (
    objectKey: string,
    maxBytes: number,
    signal?: AbortSignal,
  ) => Promise<Uint8Array>;
  deletePrivateReportAttachment?: (objectKey: string, signal?: AbortSignal) => Promise<void>;
  putKaptenImageObject?: (
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
    contentSha256: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  deleteKaptenImageObject?: (objectKey: string, signal?: AbortSignal) => Promise<void>;
};

type PrivateStagingMultipartPart = {
  etag: string | undefined;
  partNumber: number | undefined;
  size: number | undefined;
};

type PrivateStagingMultipartUpload = {
  initiatedAt?: Date | undefined;
  key: string | undefined;
  uploadId: string | undefined;
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

class PrivateReportAttachmentTooLargeError extends Error {
  constructor() {
    super("Lampiran laporan melebihi batas ukuran.");
    this.name = "PrivateReportAttachmentTooLargeError";
  }
}

const PRIVATE_QUESTION_BANK_XLSX_KEY_PATTERN =
  /^question-bank-xlsx-staging\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:workbook\.xlsx|manifest\.json|images\/[0-9a-f]{64}\.bin)$/iu;
const KAPTEN_IMAGE_OBJECT_KEY_PATTERN =
  /^kapten\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:gif|jpg|png|webp)$/iu;
const PRIVATE_REPORT_ATTACHMENT_KEY_PATTERN =
  /^mentor-reports\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:gif|jpg|png|webp|pdf)$/iu;

function assertPrivateQuestionBankXlsxKey(objectKey: string) {
  if (!PRIVATE_QUESTION_BANK_XLSX_KEY_PATTERN.test(objectKey)) {
    throw new Error("Invalid private staging key.");
  }
}

function assertKaptenImageObjectKey(objectKey: string) {
  if (!KAPTEN_IMAGE_OBJECT_KEY_PATTERN.test(objectKey)) {
    throw new Error("Invalid Kapten image object key.");
  }
}

function assertPrivateReportAttachmentKey(objectKey: string) {
  if (!PRIVATE_REPORT_ATTACHMENT_KEY_PATTERN.test(objectKey)) {
    throw new Error("Invalid private report attachment key.");
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

const headMediaObjectFromR2 = async (objectKey: string, signal?: AbortSignal) => {
  const { client, configuration } = getR2Client();

  return client.send(
    new HeadObjectCommand({
      Bucket: configuration.bucketName,
      Key: objectKey,
    }),
    signal ? { abortSignal: signal } : undefined,
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

const createPrivateStagingMultipartUploadFromR2 = async (
  objectKey: string,
  contentType: string,
  signal?: AbortSignal,
) => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  const response = await client.send(new CreateMultipartUploadCommand({
    Bucket: configuration.bucketName,
    CacheControl: "private, no-store, max-age=0",
    ContentType: contentType,
    Key: objectKey,
  }), signal ? { abortSignal: signal } : undefined);
  if (!response.UploadId) throw new Error("R2 multipart upload did not return an upload ID.");
  return response.UploadId;
};

const createPrivateStagingUploadPartUrlFromR2 = async (
  objectKey: string,
  uploadId: string,
  partNumber: number,
  contentLength: number,
  expiresInSeconds: number,
) => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  const uploadUrl = await getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: configuration.bucketName,
      ContentLength: contentLength,
      Key: objectKey,
      PartNumber: partNumber,
      UploadId: uploadId,
    }),
    {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(["content-length"]),
    },
  );
  return { expiresInSeconds, uploadUrl };
};

const listPrivateStagingMultipartPartsFromR2 = async (
  objectKey: string,
  uploadId: string,
  signal?: AbortSignal,
): Promise<PrivateStagingMultipartPart[]> => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  const parts: PrivateStagingMultipartPart[] = [];
  let partNumberMarker: string | undefined;
  let pageCount = 0;
  while (true) {
    if (++pageCount > 2) throw new Error("Too many R2 multipart parts.");
    const response = await client.send(new ListPartsCommand({
      Bucket: configuration.bucketName,
      Key: objectKey,
      MaxParts: 10,
      PartNumberMarker: partNumberMarker,
      UploadId: uploadId,
    }), signal ? { abortSignal: signal } : undefined);
    for (const part of response.Parts ?? []) {
      parts.push({ etag: part.ETag, partNumber: part.PartNumber, size: part.Size });
      if (parts.length > 10) throw new Error("Too many R2 multipart parts.");
    }
    if (!response.IsTruncated) return parts;
    const nextMarker = response.NextPartNumberMarker;
    if (
      !nextMarker
      || !/^\d+$/u.test(nextMarker)
      || Number(nextMarker) <= Number(partNumberMarker ?? "0")
    ) {
      throw new Error("Invalid R2 multipart part pagination.");
    }
    partNumberMarker = nextMarker;
  }
};

const listPrivateStagingMultipartUploadsFromR2 = async (
  objectKey: string,
  signal?: AbortSignal,
): Promise<PrivateStagingMultipartUpload[]> => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  const uploads: PrivateStagingMultipartUpload[] = [];
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  let pageCount = 0;
  while (true) {
    if (++pageCount > 10) throw new Error("Too many R2 multipart uploads for a staging key.");
    const response = await client.send(new ListMultipartUploadsCommand({
      Bucket: configuration.bucketName,
      KeyMarker: keyMarker,
      MaxUploads: 20,
      Prefix: objectKey,
      UploadIdMarker: uploadIdMarker,
    }), signal ? { abortSignal: signal } : undefined);
    for (const upload of response.Uploads ?? []) {
      if (upload.Key === objectKey) {
        uploads.push({ initiatedAt: upload.Initiated, key: upload.Key, uploadId: upload.UploadId });
      }
      if (uploads.length > 100) throw new Error("Too many R2 multipart uploads for a staging key.");
    }
    if (!response.IsTruncated) return uploads;
    if (!response.NextKeyMarker || response.NextUploadIdMarker === undefined) {
      throw new Error("Invalid R2 multipart upload pagination.");
    }
    keyMarker = response.NextKeyMarker;
    uploadIdMarker = response.NextUploadIdMarker;
  }
};

const completePrivateStagingMultipartUploadFromR2 = async (
  objectKey: string,
  uploadId: string,
  parts: readonly CompletedPart[],
  signal?: AbortSignal,
) => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: configuration.bucketName,
    Key: objectKey,
    MultipartUpload: { Parts: [...parts] },
    UploadId: uploadId,
  }), signal ? { abortSignal: signal } : undefined);
};

const abortPrivateStagingMultipartUploadFromR2 = async (
  objectKey: string,
  uploadId: string,
  signal?: AbortSignal,
) => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  await client.send(new AbortMultipartUploadCommand({
    Bucket: configuration.bucketName,
    Key: objectKey,
    UploadId: uploadId,
  }), signal ? { abortSignal: signal } : undefined);
};

const putPrivateStagingObjectFromR2 = async (
  objectKey: string,
  bytes: Uint8Array,
  contentType: string,
  signal?: AbortSignal,
) => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  await client.send(new PutObjectCommand({
    Body: bytes,
    Bucket: configuration.bucketName,
    CacheControl: "private, no-store, max-age=0",
    ContentType: contentType,
    Key: objectKey,
  }), signal ? { abortSignal: signal } : undefined);
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
  const cancelReader = () => {
    void reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener("abort", cancelReader, { once: true });
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
    signal?.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }

  if (signal?.aborted) throw signal.reason ?? new Error("Staging object read was aborted.");

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

const deletePrivateStagingObjectFromR2 = async (objectKey: string, signal?: AbortSignal) => {
  assertPrivateQuestionBankXlsxKey(objectKey);
  const { client, configuration } = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: configuration.bucketName, Key: objectKey }), signal ? { abortSignal: signal } : undefined);
};

const putPrivateReportAttachmentFromR2 = async (
  objectKey: string,
  bytes: Uint8Array,
  contentType: string,
  signal?: AbortSignal,
) => {
  assertPrivateReportAttachmentKey(objectKey);
  const { client, configuration } = getR2Client();
  await client.send(new PutObjectCommand({
    Body: bytes,
    Bucket: configuration.bucketName,
    CacheControl: "private, no-store, max-age=0",
    ContentType: contentType,
    Key: objectKey,
  }), signal ? { abortSignal: signal } : undefined);
};

const readPrivateReportAttachmentFromR2 = async (
  objectKey: string,
  maxBytes: number,
  signal?: AbortSignal,
) => {
  assertPrivateReportAttachmentKey(objectKey);
  const object = await readMediaObjectStreamFromR2(objectKey, signal);
  if (object.contentLength !== undefined && object.contentLength > maxBytes) {
    await object.body.cancel().catch(() => undefined);
    throw new PrivateReportAttachmentTooLargeError();
  }

  const reader = object.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel(signal.reason);
        throw signal.reason ?? new Error("Attachment read was aborted.");
      }
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new PrivateReportAttachmentTooLargeError();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  if (signal?.aborted) throw signal.reason ?? new Error("Attachment read was aborted.");
  if (object.contentLength !== undefined && object.contentLength !== byteLength) {
    throw new Error("Private report attachment size does not match its metadata.");
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const deletePrivateReportAttachmentFromR2 = async (objectKey: string, signal?: AbortSignal) => {
  assertPrivateReportAttachmentKey(objectKey);
  const { client, configuration } = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: configuration.bucketName, Key: objectKey }), signal ? { abortSignal: signal } : undefined);
};

const putKaptenImageObjectFromR2 = async (
  objectKey: string,
  bytes: Uint8Array,
  contentType: string,
  contentSha256: string,
  signal?: AbortSignal,
) => {
  assertKaptenImageObjectKey(objectKey);
  if (!/^[0-9a-f]{64}$/u.test(contentSha256)) throw new Error("Invalid image checksum.");
  const { client, configuration } = getR2Client();
  await client.send(new PutObjectCommand({
    Body: bytes,
    Bucket: configuration.bucketName,
    CacheControl: "private, no-store, max-age=0",
    ContentType: contentType,
    Key: objectKey,
    Metadata: { sha256: contentSha256 },
  }), signal ? { abortSignal: signal } : undefined);
};

const deleteKaptenImageObjectFromR2 = async (objectKey: string, signal?: AbortSignal) => {
  assertKaptenImageObjectKey(objectKey);
  const { client, configuration } = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: configuration.bucketName, Key: objectKey }), signal ? { abortSignal: signal } : undefined);
};

const createMediaUploadUrl = async (objectKey: string, mimeType: string) => (
  mediaStorageTestOverrides?.createUploadUrl?.(objectKey, mimeType)
  ?? createMediaUploadUrlFromR2(objectKey, mimeType)
);

const headMediaObject = async (objectKey: string, signal?: AbortSignal) => (
  mediaStorageTestOverrides?.headObject?.(objectKey, signal)
  ?? headMediaObjectFromR2(objectKey, signal)
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

const createPrivateStagingMultipartUpload = async (
  objectKey: string,
  contentType: string,
  signal?: AbortSignal,
) => (
  mediaStorageTestOverrides?.createPrivateStagingMultipartUpload?.(objectKey, contentType, signal)
  ?? createPrivateStagingMultipartUploadFromR2(objectKey, contentType, signal)
);

const createPrivateStagingUploadPartUrl = async (
  objectKey: string,
  uploadId: string,
  partNumber: number,
  contentLength: number,
  expiresInSeconds: number,
) => (
  mediaStorageTestOverrides?.createPrivateStagingUploadPartUrl?.(
    objectKey,
    uploadId,
    partNumber,
    contentLength,
    expiresInSeconds,
  )
  ?? createPrivateStagingUploadPartUrlFromR2(objectKey, uploadId, partNumber, contentLength, expiresInSeconds)
);

const listPrivateStagingMultipartParts = async (
  objectKey: string,
  uploadId: string,
  signal?: AbortSignal,
) => (
  mediaStorageTestOverrides?.listPrivateStagingMultipartParts?.(objectKey, uploadId, signal)
  ?? listPrivateStagingMultipartPartsFromR2(objectKey, uploadId, signal)
);

const listPrivateStagingMultipartUploads = async (objectKey: string, signal?: AbortSignal) => (
  mediaStorageTestOverrides?.listPrivateStagingMultipartUploads?.(objectKey, signal)
  ?? listPrivateStagingMultipartUploadsFromR2(objectKey, signal)
);

const completePrivateStagingMultipartUpload = async (
  objectKey: string,
  uploadId: string,
  parts: readonly CompletedPart[],
  signal?: AbortSignal,
) => (
  mediaStorageTestOverrides?.completePrivateStagingMultipartUpload?.(objectKey, uploadId, parts, signal)
  ?? completePrivateStagingMultipartUploadFromR2(objectKey, uploadId, parts, signal)
);

const abortPrivateStagingMultipartUpload = async (
  objectKey: string,
  uploadId: string,
  signal?: AbortSignal,
) => (
  mediaStorageTestOverrides?.abortPrivateStagingMultipartUpload?.(objectKey, uploadId, signal)
  ?? abortPrivateStagingMultipartUploadFromR2(objectKey, uploadId, signal)
);

const putPrivateStagingObject = async (
  objectKey: string,
  bytes: Uint8Array,
  contentType: string,
  signal?: AbortSignal,
) => (
  mediaStorageTestOverrides?.putPrivateStagingObject?.(objectKey, bytes, contentType, signal)
  ?? putPrivateStagingObjectFromR2(objectKey, bytes, contentType, signal)
);

const readPrivateStagingObject = async (
  objectKey: string,
  maxBytes: number,
  signal?: AbortSignal,
) => (
  mediaStorageTestOverrides?.readPrivateStagingObject?.(objectKey, maxBytes, signal)
  ?? readPrivateStagingObjectFromR2(objectKey, maxBytes, signal)
);

const deletePrivateStagingObject = async (objectKey: string, signal?: AbortSignal) => (
  mediaStorageTestOverrides?.deletePrivateStagingObject?.(objectKey, signal)
  ?? deletePrivateStagingObjectFromR2(objectKey, signal)
);

const deletePrivateStagingObjects = async (objectKeys: readonly string[], signal?: AbortSignal) => {
  if (objectKeys.length > 1_000) throw new Error("Too many private staging objects to delete.");
  for (const objectKey of objectKeys) assertPrivateQuestionBankXlsxKey(objectKey);
  const override = mediaStorageTestOverrides?.deletePrivateStagingObjects;
  if (override) {
    await override(objectKeys, signal);
    return;
  }
  for (let offset = 0; offset < objectKeys.length; offset += 8) {
    if (signal?.aborted) throw signal.reason ?? new Error("Staging deletion was aborted.");
    const batch = objectKeys.slice(offset, offset + 8);
    const results = await Promise.allSettled(batch.map((objectKey) => deletePrivateStagingObjectFromR2(objectKey, signal)));
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("Some private staging objects could not be deleted.");
    }
  }
};

const putPrivateReportAttachment = async (
  objectKey: string,
  bytes: Uint8Array,
  contentType: string,
  signal?: AbortSignal,
) => {
  assertPrivateReportAttachmentKey(objectKey);
  return mediaStorageTestOverrides?.putPrivateReportAttachment?.(objectKey, bytes, contentType, signal)
    ?? putPrivateReportAttachmentFromR2(objectKey, bytes, contentType, signal);
};

const readPrivateReportAttachment = async (
  objectKey: string,
  maxBytes: number,
  signal?: AbortSignal,
) => {
  assertPrivateReportAttachmentKey(objectKey);
  return mediaStorageTestOverrides?.readPrivateReportAttachment?.(objectKey, maxBytes, signal)
    ?? readPrivateReportAttachmentFromR2(objectKey, maxBytes, signal);
};

const deletePrivateReportAttachment = async (objectKey: string, signal?: AbortSignal) => {
  assertPrivateReportAttachmentKey(objectKey);
  return mediaStorageTestOverrides?.deletePrivateReportAttachment?.(objectKey, signal)
    ?? deletePrivateReportAttachmentFromR2(objectKey, signal);
};

const putKaptenImageObject = async (
  objectKey: string,
  bytes: Uint8Array,
  contentType: string,
  contentSha256: string,
  signal?: AbortSignal,
) => {
  assertKaptenImageObjectKey(objectKey);
  return mediaStorageTestOverrides?.putKaptenImageObject?.(
    objectKey,
    bytes,
    contentType,
    contentSha256,
    signal,
  ) ?? putKaptenImageObjectFromR2(objectKey, bytes, contentType, contentSha256, signal);
};

const deleteKaptenImageObject = async (objectKey: string, signal?: AbortSignal) => {
  assertKaptenImageObjectKey(objectKey);
  return mediaStorageTestOverrides?.deleteKaptenImageObject?.(objectKey, signal)
    ?? deleteKaptenImageObjectFromR2(objectKey, signal);
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
  PrivateReportAttachmentTooLargeError,
  createMediaPreviewUrl,
  createMediaUploadUrl,
  createPrivateStagingUploadUrl,
  createPrivateStagingMultipartUpload,
  createPrivateStagingUploadPartUrl,
  listPrivateStagingMultipartParts,
  listPrivateStagingMultipartUploads,
  completePrivateStagingMultipartUpload,
  abortPrivateStagingMultipartUpload,
  deletePrivateStagingObject,
  deletePrivateStagingObjects,
  deletePrivateReportAttachment,
  deleteKaptenImageObject,
  headMediaObject,
  isR2Configured,
  readMediaObject,
  readMediaObjectStream,
  readPrivateStagingObject,
  readPrivateReportAttachment,
  putPrivateStagingObject,
  putPrivateReportAttachment,
  putKaptenImageObject,
  withMediaStorageTestOverrides,
};
export type {
  MediaObjectStream,
  MediaPreviewUrlOptions,
  MediaStorageTestOverrides,
  PrivateStagingMultipartPart,
  PrivateStagingMultipartUpload,
};
