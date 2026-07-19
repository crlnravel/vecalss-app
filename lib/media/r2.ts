import "server-only";

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const PREVIEW_URL_TTL_SECONDS = 15 * 60;

type R2Configuration = {
  accessKeyId: string;
  accountId: string;
  bucketName: string;
  secretAccessKey: string;
};

class R2ConfigurationError extends Error {
  constructor() {
    super("Penyimpanan R2 belum dikonfigurasi.");
    this.name = "R2ConfigurationError";
  }
}

let cachedClient: S3Client | null = null;

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

const createMediaUploadUrl = async (objectKey: string, mimeType: string) => {
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

const createMediaPreviewUrl = async (objectKey: string) => {
  const { client, configuration } = getR2Client();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: configuration.bucketName,
      Key: objectKey,
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

const headMediaObject = async (objectKey: string) => {
  const { client, configuration } = getR2Client();

  return client.send(
    new HeadObjectCommand({
      Bucket: configuration.bucketName,
      Key: objectKey,
    }),
  );
};

export {
  R2ConfigurationError,
  createMediaPreviewUrl,
  createMediaUploadUrl,
  headMediaObject,
  isR2Configured,
  readMediaObject,
};
