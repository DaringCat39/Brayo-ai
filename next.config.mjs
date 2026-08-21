/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/ffmpeg-static/ffmpeg',
      './node_modules/ffprobe-static/bin/linux/x64/ffprobe',
    ],
  },
  outputFileTracingExcludes: {
    '/api/**/*': [
      './.data/**/*',
      './node_modules/ffprobe-static/bin/darwin/**/*',
      './node_modules/ffprobe-static/bin/win32/**/*',
      './node_modules/ffprobe-static/bin/linux/ia32/**/*',
      './node_modules/onnxruntime-node/bin/napi-v3/darwin/**/*',
      './node_modules/onnxruntime-node/bin/napi-v3/win32/**/*',
      './node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**/*',
    ],
  },
};

export default nextConfig;
