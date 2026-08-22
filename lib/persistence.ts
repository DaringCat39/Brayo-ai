import { BlobNotFoundError, del, get, list, put } from '@vercel/blob';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as localDb from '@/lib/db';
import { IS_VERCEL, projectWorkspacePath } from '@/lib/paths';
import type { Project, PublishingProvider } from '@/types';

export type { StoredIntegrationAccount } from '@/lib/db';
import type { StoredIntegrationAccount } from '@/lib/db';

const PROJECT_PREFIX = 'brayo/metadata/projects/';
const INTEGRATION_PREFIX = 'brayo/metadata/integrations/';
const INTERMEDIATE_PREFIX = 'brayo/intermediate/projects/';

function intermediatePath(projectId: string, key: string) {
  const parts = key.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..' || part !== path.basename(part))) {
    throw new Error('Invalid intermediate result key.');
  }
  return path.join(projectWorkspacePath(projectId), 'intermediate', ...parts);
}

function requireBlobPersistence() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required for persistent Brayo project metadata on Vercel.');
  }
}

async function readBlobJson<T>(pathname: string): Promise<T | null> {
  requireBlobPersistence();
  try {
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return await new Response(result.stream).json() as T;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

async function writeBlobJson(pathname: string, value: unknown) {
  requireBlobPersistence();
  await put(pathname, JSON.stringify(value), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

export async function readProjectIntermediate<T>(projectId: string, key: string): Promise<T | null> {
  if (IS_VERCEL) return readBlobJson<T>(`${INTERMEDIATE_PREFIX}${projectId}/${key}`);
  try {
    return JSON.parse(await readFile(intermediatePath(projectId, key), 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeProjectIntermediate(projectId: string, key: string, value: unknown) {
  if (IS_VERCEL) {
    await writeBlobJson(`${INTERMEDIATE_PREFIX}${projectId}/${key}`, value);
    return;
  }
  const filename = intermediatePath(projectId, key);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, JSON.stringify(value), 'utf8');
}

export async function getIntegrationAccount(provider: PublishingProvider) {
  if (!IS_VERCEL) return localDb.getIntegrationAccount(provider);
  return readBlobJson<StoredIntegrationAccount>(`${INTEGRATION_PREFIX}${provider}.json`);
}

export async function saveIntegrationAccount(account: StoredIntegrationAccount) {
  if (!IS_VERCEL) return localDb.saveIntegrationAccount(account);
  await writeBlobJson(`${INTEGRATION_PREFIX}${account.provider}.json`, account);
  return account;
}

export async function deleteIntegrationAccount(provider: PublishingProvider) {
  if (!IS_VERCEL) return localDb.deleteIntegrationAccount(provider);
  requireBlobPersistence();
  await del(`${INTEGRATION_PREFIX}${provider}.json`);
}

export async function saveProject(project: Project) {
  project.updatedAt = new Date().toISOString();
  if (!IS_VERCEL) return localDb.saveProject(project);
  await writeBlobJson(`${PROJECT_PREFIX}${project.id}.json`, project);
  return project;
}

export async function getProject(id: string) {
  if (!IS_VERCEL) return localDb.getProject(id);
  return readBlobJson<Project>(`${PROJECT_PREFIX}${id}.json`);
}

export async function listProjects() {
  if (!IS_VERCEL) return localDb.listProjects();
  requireBlobPersistence();
  const pathnames: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PROJECT_PREFIX, cursor, limit: 1000 });
    pathnames.push(...page.blobs.map((blob) => blob.pathname).filter((pathname) => pathname.endsWith('.json')));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const projects = (await Promise.all(pathnames.map((pathname) => readBlobJson<Project>(pathname))))
    .filter((project): project is Project => Boolean(project));
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(id: string) {
  if (!IS_VERCEL) return localDb.deleteProject(id);
  requireBlobPersistence();
  await del(`${PROJECT_PREFIX}${id}.json`);
}
