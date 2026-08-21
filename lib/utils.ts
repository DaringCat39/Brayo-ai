export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatDuration(seconds = 0) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function safeFilename(name: string) {
  const normalized = name.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]/g, '');
  return normalized.replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 140) || 'video.mp4';
}

export function titleFromFilename(name: string) {
  const withoutExtension = name.replace(/\.[^/.]+$/, '');
  return withoutExtension.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled project';
}

export function now() {
  return new Date().toISOString();
}
