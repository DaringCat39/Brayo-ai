export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm', '.m4v'] as const;

export const VIDEO_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/x-m4v',
  'application/octet-stream',
] as const;

export const BLOB_VIDEO_PREFIX = 'brayo/source-videos/';
export const DEFAULT_MAX_VIDEO_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export function isAllowedVideoExtension(extension: string) {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}
