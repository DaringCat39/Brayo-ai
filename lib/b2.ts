import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
  type ObjectIdentifier,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REQUIRED_B2_ENV = [
  'B2_ENDPOINT',
  'B2_REGION',
  'B2_BUCKET_NAME',
  'B2_APPLICATION_KEY_ID',
  'B2_APPLICATION_KEY',
] as const;

export const B2_PROJECT_PREFIX = 'brayo/projects/';
export const B2_PROJECT_METADATA_PREFIX = 'brayo/metadata/projects/';
export const B2_INTEGRATION_PREFIX = 'brayo/metadata/integrations/';

export class StorageConfigurationError extends Error {
  readonly code = 'STORAGE_NOT_CONFIGURED';

  constructor(message = 'Production object storage is not configured.') {
    super(message);
    this.name = 'StorageConfigurationError';
  }
}

interface B2Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface UploadSessionClaims {
  version: 1;
  projectId: string;
  key: string;
  uploadId: string;
  filename: string;
  contentType: string;
  size: number;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var brayoB2Client: S3Client | undefined;
  // eslint-disable-next-line no-var
  var brayoB2ClientFingerprint: string | undefined;
}

function readB2Config(): B2Config {
  const missing = REQUIRED_B2_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new StorageConfigurationError(`Missing Backblaze B2 configuration: ${missing.join(', ')}.`);
  }
  const rawEndpoint = process.env.B2_ENDPOINT!.trim().replace(/\/$/, '');
  const endpoint = /^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`;
  if (process.env.VERCEL && !endpoint.startsWith('https://')) {
    throw new StorageConfigurationError('B2_ENDPOINT must use HTTPS in production.');
  }
  return {
    endpoint,
    region: process.env.B2_REGION!.trim(),
    bucket: process.env.B2_BUCKET_NAME!.trim(),
    accessKeyId: process.env.B2_APPLICATION_KEY_ID!.trim(),
    secretAccessKey: process.env.B2_APPLICATION_KEY!.trim(),
  };
}

export function b2Configured() {
  return REQUIRED_B2_ENV.every((name) => Boolean(process.env[name]?.trim()));
}

export function b2BucketName() {
  return readB2Config().bucket;
}

export function b2Client() {
  const config = readB2Config();
  const fingerprint = `${config.endpoint}|${config.region}|${config.bucket}|${config.accessKeyId}`;
  if (!global.brayoB2Client || global.brayoB2ClientFingerprint !== fingerprint) {
    global.brayoB2Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    global.brayoB2ClientFingerprint = fingerprint;
  }
  return global.brayoB2Client;
}

export function projectObjectPrefix(projectId: string) {
  assertProjectId(projectId);
  return `${B2_PROJECT_PREFIX}${projectId}/`;
}

export function projectMetadataKey(projectId: string) {
  assertProjectId(projectId);
  return `${B2_PROJECT_METADATA_PREFIX}${projectId}.json`;
}

export function projectSourceKey(projectId: string, extension: string) {
  return `${projectObjectPrefix(projectId)}source/source${extension.toLowerCase()}`;
}

export function projectMediaKey(projectId: string, filename: string) {
  const safeName = assertSafePathPart(filename);
  return `${projectObjectPrefix(projectId)}media/${safeName}`;
}

export function projectIntermediateKey(projectId: string, key: string) {
  const parts = key.split('/').filter(Boolean).map(assertSafePathPart);
  if (!parts.length) throw new Error('Invalid intermediate result key.');
  return `${projectObjectPrefix(projectId)}intermediate/${parts.join('/')}`;
}

export function assertProjectId(projectId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(projectId)) throw new Error('Invalid project identifier.');
  return projectId;
}

function assertSafePathPart(value: string) {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error('Invalid object name.');
  }
  return value;
}

function tokenSecret() {
  return readB2Config().secretAccessKey;
}

export function signUploadSession(claims: UploadSessionClaims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyUploadSession(token: string): UploadSessionClaims {
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) throw new Error('Invalid upload session.');
  const expectedSignature = createHmac('sha256', tokenSecret()).update(payload).digest();
  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    throw new Error('Invalid upload session.');
  }
  if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) {
    throw new Error('Invalid upload session.');
  }
  let claims: UploadSessionClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadSessionClaims;
  } catch {
    throw new Error('Invalid upload session.');
  }
  if (
    claims.version !== 1
    || !claims.uploadId
    || !claims.key.startsWith(projectObjectPrefix(claims.projectId))
    || claims.expiresAt < Date.now()
    || !Number.isSafeInteger(claims.size)
    || claims.size <= 0
  ) {
    throw new Error(claims.expiresAt < Date.now() ? 'The upload session expired. Retry the upload.' : 'Invalid upload session.');
  }
  return claims;
}

export async function createB2MultipartUpload(options: {
  projectId?: string;
  filename: string;
  extension: string;
  contentType: string;
  size: number;
}) {
  const projectId = options.projectId || randomUUID();
  const key = projectSourceKey(projectId, options.extension);
  const result = await b2Client().send(new CreateMultipartUploadCommand({
    Bucket: b2BucketName(),
    Key: key,
    ContentType: options.contentType,
    Metadata: { projectId },
  }));
  if (!result.UploadId) throw new Error('Object storage did not create a multipart upload session.');
  const claims: UploadSessionClaims = {
    version: 1,
    projectId,
    key,
    uploadId: result.UploadId,
    filename: options.filename,
    contentType: options.contentType,
    size: options.size,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  return { claims, sessionToken: signUploadSession(claims) };
}

export async function signB2UploadParts(claims: UploadSessionClaims, partNumbers: number[]) {
  const totalParts = Math.ceil(claims.size / multipartPartSize(claims.size));
  if (
    !partNumbers.length
    || partNumbers.length > 16
    || partNumbers.some((part) => !Number.isInteger(part) || part < 1 || part > totalParts)
  ) {
    throw new Error('Invalid multipart part request.');
  }
  const client = b2Client();
  return Promise.all(partNumbers.map(async (partNumber) => ({
    partNumber,
    url: await getSignedUrl(client, new UploadPartCommand({
      Bucket: b2BucketName(),
      Key: claims.key,
      UploadId: claims.uploadId,
      PartNumber: partNumber,
    }), { expiresIn: 60 * 60 }),
  })));
}

export async function completeB2MultipartUpload(claims: UploadSessionClaims, parts: CompletedPart[]) {
  const expectedParts = Math.ceil(claims.size / multipartPartSize(claims.size));
  const ordered = [...parts].sort((a, b) => Number(a.PartNumber) - Number(b.PartNumber));
  if (
    ordered.length !== expectedParts
    || ordered.some((part, index) => part.PartNumber !== index + 1 || !part.ETag)
  ) {
    throw new Error('The multipart upload is incomplete. Retry the missing parts.');
  }
  try {
    await b2Client().send(new CompleteMultipartUploadCommand({
      Bucket: b2BucketName(),
      Key: claims.key,
      UploadId: claims.uploadId,
      MultipartUpload: { Parts: ordered },
    }));
  } catch (error) {
    // A browser can lose the small completion response after B2 has already
    // committed the object. Treat that retry as idempotent when the exact-size
    // object now exists at this upload's unique project key.
    const name = (error as { name?: string }).name;
    if (name !== 'NoSuchUpload') throw error;
  }
  const stored = await headB2Object(claims.key);
  if (stored.ContentLength !== claims.size) {
    throw new Error(`Object storage saved ${stored.ContentLength || 0} of ${claims.size} bytes.`);
  }
  return stored;
}

export async function abortB2MultipartUpload(claims: UploadSessionClaims) {
  await b2Client().send(new AbortMultipartUploadCommand({
    Bucket: b2BucketName(),
    Key: claims.key,
    UploadId: claims.uploadId,
  }));
}

export function multipartPartSize(size: number) {
  const minimum = 16 * 1024 * 1024;
  const required = Math.ceil(size / 9_999);
  const mebibyte = 1024 * 1024;
  return Math.max(minimum, Math.ceil(required / mebibyte) * mebibyte);
}

export async function headB2Object(key: string) {
  return b2Client().send(new HeadObjectCommand({ Bucket: b2BucketName(), Key: key }));
}

export async function getB2Object(key: string) {
  return b2Client().send(new GetObjectCommand({ Bucket: b2BucketName(), Key: key }));
}

export async function putB2Object(key: string, body: string | Uint8Array, contentType: string) {
  const result = await b2Client().send(new PutObjectCommand({
    Bucket: b2BucketName(),
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'private, max-age=0, must-revalidate',
  }));
  await deleteOlderObjectVersions(key, result.VersionId);
  return result;
}

export async function listB2ObjectKeys(prefix: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await b2Client().send(new ListObjectsV2Command({
      Bucket: b2BucketName(),
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));
    keys.push(...(page.Contents || []).flatMap((item) => item.Key ? [item.Key] : []));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function listVersionIdentifiers(prefix: string) {
  const objects: Array<ObjectIdentifier & { isLatest?: boolean }> = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  do {
    const page = await b2Client().send(new ListObjectVersionsCommand({
      Bucket: b2BucketName(),
      Prefix: prefix,
      KeyMarker: keyMarker,
      VersionIdMarker: versionIdMarker,
      MaxKeys: 1000,
    }));
    objects.push(...(page.Versions || []).flatMap((item) => item.Key && item.VersionId
      ? [{ Key: item.Key, VersionId: item.VersionId, isLatest: item.IsLatest }]
      : []));
    objects.push(...(page.DeleteMarkers || []).flatMap((item) => item.Key && item.VersionId
      ? [{ Key: item.Key, VersionId: item.VersionId, isLatest: item.IsLatest }]
      : []));
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker);
  return objects;
}

async function deleteVersionIdentifiers(objects: ObjectIdentifier[]) {
  for (let offset = 0; offset < objects.length; offset += 1000) {
    const batch = objects.slice(offset, offset + 1000);
    if (!batch.length) continue;
    const result = await b2Client().send(new DeleteObjectsCommand({
      Bucket: b2BucketName(),
      Delete: { Objects: batch, Quiet: true },
    }));
    if (result.Errors?.length) {
      throw new Error(`Object storage could not delete ${result.Errors.length} obsolete object version(s).`);
    }
  }
}

export async function deleteAllObjectVersions(keyOrPrefix: string, exact = false) {
  const versions = await listVersionIdentifiers(keyOrPrefix);
  await deleteVersionIdentifiers(versions.filter((item) => !exact || item.Key === keyOrPrefix));
}

export async function deleteObjectVersion(key: string, versionId?: string) {
  if (!versionId) return;
  await deleteVersionIdentifiers([{ Key: key, VersionId: versionId }]);
}

export async function deleteOlderObjectVersions(key: string, keepVersionId?: string) {
  const versions = (await listVersionIdentifiers(key)).filter((item) => item.Key === key);
  if (keepVersionId && !versions.some((item) => item.VersionId === keepVersionId && item.isLatest)) {
    // Another invocation wrote a newer value. It owns cleanup so this older
    // writer must not delete the new current version.
    return;
  }
  const obsolete = keepVersionId
    ? versions.filter((item) => item.VersionId !== keepVersionId)
    : versions.filter((item) => !item.isLatest);
  await deleteVersionIdentifiers(obsolete);
}

async function abortObsoleteMultipartUploads(currentProjectId: string) {
  const currentPrefix = projectObjectPrefix(currentProjectId);
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  do {
    const page = await b2Client().send(new ListMultipartUploadsCommand({
      Bucket: b2BucketName(),
      Prefix: B2_PROJECT_PREFIX,
      KeyMarker: keyMarker,
      UploadIdMarker: uploadIdMarker,
    }));
    const obsolete = (page.Uploads || []).filter((upload) =>
      upload.Key && upload.UploadId && !upload.Key.startsWith(currentPrefix));
    await Promise.all(obsolete.map((upload) => b2Client().send(new AbortMultipartUploadCommand({
      Bucket: b2BucketName(),
      Key: upload.Key!,
      UploadId: upload.UploadId!,
    }))));
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
  } while (keyMarker);
}

export async function pruneB2ToCurrentProject(currentProjectId: string) {
  const currentPrefix = projectObjectPrefix(currentProjectId);
  const currentMetadata = projectMetadataKey(currentProjectId);
  const [projectVersions, metadataVersions] = await Promise.all([
    listVersionIdentifiers(B2_PROJECT_PREFIX),
    listVersionIdentifiers(B2_PROJECT_METADATA_PREFIX),
  ]);
  const obsolete = [
    ...projectVersions.filter((item) => !item.Key?.startsWith(currentPrefix)),
    ...metadataVersions.filter((item) => item.Key !== currentMetadata),
  ];
  await deleteVersionIdentifiers(obsolete);
  await abortObsoleteMultipartUploads(currentProjectId);
}

export async function signedB2ReadUrl(key: string, downloadFilename?: string) {
  return getSignedUrl(b2Client(), new GetObjectCommand({
    Bucket: b2BucketName(),
    Key: key,
    ResponseContentDisposition: downloadFilename
      ? `attachment; filename="${downloadFilename.replace(/["\\\r\n]/g, '_')}"`
      : undefined,
  }), { expiresIn: 60 * 60 });
}

export function isB2NotFound(error: unknown) {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate?.name === 'NoSuchKey' || candidate?.name === 'NotFound' || candidate?.$metadata?.httpStatusCode === 404;
}

export function storageErrorDetails(error: unknown, fallback: string) {
  const candidate = error as { name?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  if (error instanceof StorageConfigurationError) {
    return { error: error.message, code: error.code, retryable: false, status: 503 };
  }
  const status = candidate?.$metadata?.httpStatusCode;
  const code = candidate?.Code || candidate?.name || 'STORAGE_ERROR';
  const safeMessage = candidate?.message && !/credential|secret|application key/i.test(candidate.message)
    ? candidate.message
    : fallback;
  return {
    error: safeMessage,
    code,
    retryable: !status || status === 408 || status === 429 || status >= 500,
    status: status && status >= 400 && status < 600 ? status : 502,
  };
}
