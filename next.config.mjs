import { withWorkflow } from 'workflow/next';

const processingBinaries = [
  './node_modules/ffmpeg-static/ffmpeg',
  './node_modules/ffprobe-static/bin/linux/x64/ffprobe',
];

const processingExcludes = [
  './.data/**/*',
  './node_modules/ffprobe-static/bin/darwin/**/*',
  './node_modules/ffprobe-static/bin/win32/**/*',
  './node_modules/ffprobe-static/bin/linux/ia32/**/*',
  './node_modules/onnxruntime-node/bin/napi-v3/darwin/**/*',
  './node_modules/onnxruntime-node/bin/napi-v3/win32/**/*',
  './node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**/*',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/api/**/*': processingBinaries,
    '/.well-known/workflow/v1/step': processingBinaries,
  },
  outputFileTracingExcludes: {
    '/api/**/*': processingExcludes,
    '/.well-known/workflow/v1/step': processingExcludes,
  },
};

export default withWorkflow(nextConfig);
