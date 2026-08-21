/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/ffmpeg-static/**/*', './node_modules/ffprobe-static/**/*'],
  },
};

export default nextConfig;
