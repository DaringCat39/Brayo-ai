import {
  DeleteObjectsCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const required = [
  'B2_ENDPOINT',
  'B2_REGION',
  'B2_BUCKET_NAME',
  'B2_APPLICATION_KEY_ID',
  'B2_APPLICATION_KEY',
  'APP_URL',
];
const values = Object.fromEntries(required.map((name) => [name, process.env[name]?.trim() || '']));
const missing = required.filter((name) => !values[name]);
if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

const appUrl = new URL(values.APP_URL);
if (appUrl.protocol !== 'https:' || values.APP_URL !== appUrl.origin) {
  throw new Error('APP_URL must be the exact production HTTPS origin without a trailing slash or path.');
}
const expectedEndpoint = `https://s3.${values.B2_REGION}.backblazeb2.com`;
const endpoint = (/^https?:\/\//i.test(values.B2_ENDPOINT) ? values.B2_ENDPOINT : `https://${values.B2_ENDPOINT}`).replace(/\/+$/, '');
if (endpoint.toLowerCase() !== expectedEndpoint.toLowerCase()) {
  throw new Error(`B2_ENDPOINT must be ${expectedEndpoint}.`);
}

const baseUrl = new URL((process.env.BRAYO_SMOKE_BASE_URL || 'http://127.0.0.1:3111').trim());
const apiOrigin = baseUrl.origin;
const smokeSize = 5 * 1024 * 1024;
const client = new S3Client({
  endpoint,
  region: values.B2_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: values.B2_APPLICATION_KEY_ID,
    secretAccessKey: values.B2_APPLICATION_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

let sessionToken;
let objectKey;
let completed = false;

async function appJson(path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: apiOrigin,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

function includesIgnoreCase(items, expected) {
  return items?.some((item) => item.toLowerCase() === expected.toLowerCase());
}

function corsRuleAllows(rule, origin) {
  return rule.AllowedOrigins?.includes(origin)
    && ['GET', 'HEAD', 'PUT'].every((method) => includesIgnoreCase(rule.AllowedMethods, method))
    && rule.AllowedHeaders?.includes('*')
    && includesIgnoreCase(rule.ExposeHeaders, 'ETag')
    && Number(rule.MaxAgeSeconds) <= 86_400;
}

async function deleteEveryVersion(key) {
  const objects = [];
  let keyMarker;
  let versionIdMarker;
  do {
    const page = await client.send(new ListObjectVersionsCommand({
      Bucket: values.B2_BUCKET_NAME,
      Prefix: key,
      KeyMarker: keyMarker,
      VersionIdMarker: versionIdMarker,
    }));
    objects.push(...(page.Versions || []).flatMap((item) => item.Key === key && item.VersionId
      ? [{ Key: item.Key, VersionId: item.VersionId }]
      : []));
    objects.push(...(page.DeleteMarkers || []).flatMap((item) => item.Key === key && item.VersionId
      ? [{ Key: item.Key, VersionId: item.VersionId }]
      : []));
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker);

  for (let offset = 0; offset < objects.length; offset += 1_000) {
    const result = await client.send(new DeleteObjectsCommand({
      Bucket: values.B2_BUCKET_NAME,
      Delete: { Objects: objects.slice(offset, offset + 1_000), Quiet: true },
    }));
    if (result.Errors?.length) throw new Error(`Could not delete ${result.Errors.length} smoke-test object version(s).`);
  }
}

try {
  await client.send(new HeadBucketCommand({ Bucket: values.B2_BUCKET_NAME }));
  console.log('PASS B2 bucket exists and restricted credentials work');

  let corsReadable = false;
  try {
    const cors = await client.send(new GetBucketCorsCommand({ Bucket: values.B2_BUCKET_NAME }));
    if (!cors.CORSRules?.some((rule) => corsRuleAllows(rule, appUrl.origin))) {
      throw new Error(`The S3 CORS configuration does not allow ${appUrl.origin} to PUT and read ETag.`);
    }
    corsReadable = true;
    console.log(`PASS S3 CORS configuration allows ${appUrl.origin}`);
  } catch (error) {
    if (error?.name !== 'AccessDenied' && error?.$metadata?.httpStatusCode !== 403) throw error;
    console.log('INFO runtime key cannot read bucket CORS; functional browser preflight will verify it instead');
  }

  const capabilities = await appJson('/api/uploads');
  if (!capabilities.direct || !capabilities.multipart || capabilities.provider !== 'backblaze-b2') {
    throw new Error('The running app is not configured for direct Backblaze B2 multipart uploads.');
  }

  const initiated = await appJson('/api/uploads/token', {
    action: 'initiate',
    filename: `brayo-multipart-smoke-${Date.now()}.mp4`,
    contentType: 'video/mp4',
    size: smokeSize,
  });
  sessionToken = initiated.session?.sessionToken;
  objectKey = initiated.session?.key;
  if (!sessionToken || !objectKey || initiated.session.partCount !== 1) {
    throw new Error('Brayo returned an invalid multipart session.');
  }
  console.log('PASS CreateMultipartUpload through Brayo API');

  const authorized = await appJson('/api/uploads/token', {
    action: 'sign-parts',
    sessionToken,
    partNumbers: [1],
  });
  const part = authorized.parts?.[0];
  if (!part || part.method !== 'PUT' || part.partNumber !== 1) throw new Error('Invalid UploadPart authorization response.');
  const target = new URL(part.url);
  if (
    target.protocol !== 'https:'
    || target.host !== new URL(endpoint).host
    || decodeURIComponent(target.pathname) !== `/${values.B2_BUCKET_NAME}/${objectKey}`
    || target.searchParams.get('partNumber') !== '1'
    || !target.searchParams.get('uploadId')
    || target.searchParams.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256'
    || target.searchParams.get('X-Amz-SignedHeaders') !== 'host'
  ) {
    throw new Error('The presigned UploadPart URL has an invalid endpoint, bucket, key, upload ID, part number or signature.');
  }
  console.log('PASS SigV4 UploadPart URL targets the correct B2 object and part');

  const preflight = await fetch(part.url, {
    method: 'OPTIONS',
    headers: {
      origin: appUrl.origin,
      'access-control-request-method': 'PUT',
    },
  });
  const allowedOrigin = preflight.headers.get('access-control-allow-origin');
  const allowedMethods = preflight.headers.get('access-control-allow-methods') || '';
  if (!preflight.ok || allowedOrigin !== appUrl.origin || !/\bPUT\b/i.test(allowedMethods)) {
    throw new Error(`B2 browser preflight failed (${preflight.status}); origin=${allowedOrigin || 'missing'}, methods=${allowedMethods || 'missing'}.`);
  }
  if (!corsReadable) console.log(`PASS functional CORS preflight allows ${appUrl.origin}`);

  const uploaded = await fetch(part.url, {
    method: 'PUT',
    headers: { origin: appUrl.origin },
    body: new Uint8Array(smokeSize),
  });
  const responseText = await uploaded.text();
  const etag = uploaded.headers.get('etag');
  const exposed = uploaded.headers.get('access-control-expose-headers') || '';
  if (!uploaded.ok || !etag || !/\betag\b/i.test(exposed)) {
    const requestId = uploaded.headers.get('x-amz-request-id') || 'unavailable';
    throw new Error(`UploadPart failed (${uploaded.status}, request ${requestId}): ${responseText.slice(0, 500) || 'missing or unexposed ETag'}`);
  }
  console.log('PASS direct UploadPart PUT returned an exposed ETag');

  const completion = await appJson('/api/uploads/token', {
    action: 'complete',
    sessionToken,
    parts: [{ partNumber: 1, etag }],
  });
  if (completion.upload?.key !== objectKey || completion.upload?.size !== smokeSize) {
    throw new Error('CompleteMultipartUpload returned invalid object metadata.');
  }
  completed = true;
  const stored = await client.send(new HeadObjectCommand({ Bucket: values.B2_BUCKET_NAME, Key: objectKey }));
  if (stored.ContentLength !== smokeSize) throw new Error('The completed smoke object has the wrong size.');
  console.log('PASS CompleteMultipartUpload and HeadObject verification');
} finally {
  if (sessionToken && !completed) {
    try {
      await appJson('/api/uploads/token', { action: 'abort', sessionToken });
      console.log('PASS failed smoke multipart session aborted');
    } catch (error) {
      console.error(`FAILED to abort smoke multipart session: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
  if (objectKey) {
    try {
      await deleteEveryVersion(objectKey);
      try {
        await client.send(new HeadObjectCommand({ Bucket: values.B2_BUCKET_NAME, Key: objectKey }));
        throw new Error('The smoke object still exists after cleanup.');
      } catch (error) {
        if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound' && error?.name !== 'NoSuchKey') throw error;
      }
      console.log('PASS smoke object and all versions deleted');
    } catch (error) {
      console.error(`FAILED to remove smoke object versions: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}
