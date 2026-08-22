import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';

const required = [
  'B2_ENDPOINT',
  'B2_REGION',
  'B2_BUCKET_NAME',
  'B2_APPLICATION_KEY_ID',
  'B2_APPLICATION_KEY',
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

const endpointValue = process.env.B2_ENDPOINT.trim().replace(/\/$/, '');
const endpoint = /^https?:\/\//i.test(endpointValue) ? endpointValue : `https://${endpointValue}`;
const explicitOrigins = process.argv.slice(2).map((value) => new URL(value).origin);
const configuredOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : undefined;
const origins = [...new Set([
  ...explicitOrigins,
  configuredOrigin,
  'http://localhost:3000',
  'http://localhost:3111',
].filter(Boolean))];

if (!origins.some((origin) => origin.startsWith('https://'))) {
  throw new Error('Set APP_URL to the production HTTPS URL or pass it as an argument.');
}

const client = new S3Client({
  endpoint,
  region: process.env.B2_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.B2_APPLICATION_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

await client.send(new PutBucketCorsCommand({
  Bucket: process.env.B2_BUCKET_NAME,
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: origins,
      AllowedMethods: ['GET', 'HEAD', 'PUT'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag', 'x-amz-version-id', 'x-amz-request-id'],
      MaxAgeSeconds: 86_400,
    }],
  },
}));

console.log(`Applied private B2 CORS rules for: ${origins.join(', ')}`);
