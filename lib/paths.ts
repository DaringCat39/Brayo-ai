import path from 'node:path';
import os from 'node:os';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';

export const IS_VERCEL = Boolean(process.env.VERCEL);
export const LOCAL_DATA_DIR = path.join(process.cwd(), '.data');
export const DATA_DIR = IS_VERCEL ? path.join(os.tmpdir(), 'brayo') : LOCAL_DATA_DIR;
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
// SQLite remains a localhost-only implementation. All Vercel callers go
// through lib/persistence.ts, which stores private JSON objects in B2.
export const DB_PATH = path.join(LOCAL_DATA_DIR, 'viralcut.sqlite');

export function ensureDataDirs() {
  if (IS_VERCEL) throw new Error('SQLite data directories are disabled on Vercel.');
  mkdirSync(PROJECTS_DIR, { recursive: true });
}

export function projectWorkspacePath(projectId: string) {
  return path.join(PROJECTS_DIR, projectId);
}

export function projectDir(projectId: string) {
  const dir = projectWorkspacePath(projectId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function cleanupProjectWorkspace(projectId: string) {
  if (!IS_VERCEL) return;
  const directory = path.resolve(projectWorkspacePath(projectId));
  const root = path.resolve(PROJECTS_DIR) + path.sep;
  if (!directory.startsWith(root)) throw new Error('Refusing to clean an invalid project workspace.');
  await rm(directory, { recursive: true, force: true });
}
