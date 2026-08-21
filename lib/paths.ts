import path from 'node:path';
import { mkdirSync } from 'node:fs';

export const DATA_DIR = path.join(process.cwd(), '.data');
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
export const DB_PATH = path.join(DATA_DIR, 'viralcut.sqlite');

export function ensureDataDirs() {
  mkdirSync(PROJECTS_DIR, { recursive: true });
}

export function projectDir(projectId: string) {
  const dir = path.join(PROJECTS_DIR, projectId);
  mkdirSync(dir, { recursive: true });
  return dir;
}
