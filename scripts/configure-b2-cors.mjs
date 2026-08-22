import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

if (process.env.VERCEL) {
  throw new Error('CORS administration must only run locally. Never give the Vercel runtime key writeBuckets access.');
}

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

const region = values.B2_REGION;
const endpointValue = values.B2_ENDPOINT.replace(/\/+$/, '');
const endpoint = /^https?:\/\//i.test(endpointValue) ? endpointValue : `https://${endpointValue}`;
const expectedEndpoint = `https://s3.${region}.backblazeb2.com`;
if (endpoint.toLowerCase() !== expectedEndpoint.toLowerCase()) {
  throw new Error(`B2_ENDPOINT must be ${expectedEndpoint} without a bucket name or path.`);
}

const appUrl = new URL(values.APP_URL);
if (appUrl.protocol !== 'https:' || values.APP_URL !== appUrl.origin) {
  throw new Error('APP_URL must be the exact production HTTPS origin with no path, query, fragment or trailing slash.');
}
const explicitOrigins = process.argv.slice(2).map((value) => new URL(value.trim()).origin);
const origins = [...new Set([
  'https://brayo-ai-tta2.vercel.app',
  appUrl.origin,
  ...explicitOrigins,
  'http://localhost:3000',
  'http://localhost:3111',
])];

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: values.B2_APPLICATION_KEY_ID,
    secretAccessKey: values.B2_APPLICATION_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const corsRule = {
  AllowedOrigins: origins,
  AllowedMethods: ['GET', 'HEAD', 'PUT'],
  AllowedHeaders: ['*'],
  ExposeHeaders: ['ETag'],
  MaxAgeSeconds: 86_400,
};

const corsConfiguration = { CORSRules: [corsRule] };
console.log('Applying sanitized B2 S3 CORS configuration:');
console.log(JSON.stringify({
  Bucket: values.B2_BUCKET_NAME,
  Endpoint: endpoint,
  Region: region,
  CORSConfiguration: corsConfiguration,
}, null, 2));

try {
  await client.send(new PutBucketCorsCommand({
    Bucket: values.B2_BUCKET_NAME,
    CORSConfiguration: corsConfiguration,
  }));
} catch (error) {
  const candidate = error;
  const safeError = {
    name: candidate?.name || 'unknown error',
    message: candidate?.message || 'No error message was returned.',
    code: candidate?.Code || candidate?.code || null,
    fault: candidate?.$fault || null,
    metadata: {
      httpStatusCode: candidate?.$metadata?.httpStatusCode || null,
      requestId: candidate?.$metadata?.requestId || null,
      extendedRequestId: candidate?.$metadata?.extendedRequestId || null,
      cfId: candidate?.$metadata?.cfId || null,
      attempts: candidate?.$metadata?.attempts || null,
      totalRetryDelay: candidate?.$metadata?.totalRetryDelay || null,
    },
  };
  console.error('Backblaze PutBucketCors failed:');
  console.error(JSON.stringify(safeError, null, 2));
  throw new Error(
    `Backblaze rejected PutBucketCors: ${safeError.message} (${safeError.name}, HTTP ${safeError.metadata.httpStatusCode || 'unknown'}, request ${safeError.metadata.requestId || 'unavailable'}).`,
  );
}

const verified = await client.send(new GetBucketCorsCommand({ Bucket: values.B2_BUCKET_NAME }));
const includes = (items, expected) => items?.some((item) => item.toLowerCase() === expected.toLowerCase());
const applied = verified.CORSRules?.some((rule) => (
  origins.every((origin) => rule.AllowedOrigins?.includes(origin))
  && ['GET', 'HEAD', 'PUT'].every((method) => includes(rule.AllowedMethods, method))
  && rule.AllowedHeaders?.includes('*')
  && includes(rule.ExposeHeaders, 'ETag')
  && Number(rule.MaxAgeSeconds) <= 86_400
));
if (!applied) throw new Error('Backblaze accepted the CORS update but the required browser PUT/ETag rule could not be verified.');

console.log(`Applied and verified private B2 browser CORS for: ${origins.join(', ')}`);
