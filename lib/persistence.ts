import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as localDb from '@/lib/db';
import {
  B2_INTEGRATION_PREFIX,
  B2_PROJECT_METADATA_PREFIX,
  deleteAllObjectVersions,
  deleteObjectVersion,
  getB2Object,
  isB2NotFound,
  listB2ObjectKeys,
  projectIntermediateKey,
  projectMetadataKey,
  projectObjectPrefix,
  pruneB2ToCurrentProject,
  putB2Object,
} from '@/lib/b2';
import { IS_VERCEL, projectWorkspacePath } from '@/lib/paths';
import type { Project, PublishingProvider } from '@/types';

export type { StoredIntegrationAccount } from '@/lib/db';
import type { StoredIntegrationAccount } from '@/lib/db';

const CURRENT_PROJECT_KEY = 'brayo/metadata/current-project.json';

interface CurrentProjectPointer {
  id: string;
  updatedAt: string;
}

export class ProjectSupersededError extends Error {
  constructor(projectId: string) {
    super(`Project ${projectId} is no longer the current project.`);
    this.name = 'ProjectSupersededError';
  }
}

function intermediatePath(projectId: string, key: string) {
  const parts = key.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..' || part !== path.basename(part))) {
    throw new Error('Invalid intermediate result key.');
  }
  return path.join(projectWorkspacePath(projectId), 'intermediate', ...parts);
}

async function readB2Json<T>(key: string): Promise<T | null> {
  try {
    const result = await getB2Object(key);
    if (!result.Body) return null;
    return JSON.parse(await result.Body.transformToString()) as T;
  } catch (error) {
    if (isB2NotFound(error)) return null;
    throw error;
  }
}

async function writeB2Json(key: string, value: unknown) {
  return putB2Object(key, JSON.stringify(value), 'application/json');
}

export async function readProjectIntermediate<T>(projectId: string, key: string): Promise<T | null> {
  if (IS_VERCEL) return readB2Json<T>(projectIntermediateKey(projectId, key));
  try {
    return JSON.parse(await readFile(intermediatePath(projectId, key), 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeProjectIntermediate(projectId: string, key: string, value: unknown) {
  if (IS_VERCEL) {
    const objectKey = projectIntermediateKey(projectId, key);
    await assertCurrentProject(projectId);
    const stored = await writeB2Json(objectKey, value);
    try {
      await assertCurrentProject(projectId);
    } catch (error) {
      await deleteObjectVersion(objectKey, stored.VersionId);
      throw error;
    }
    return;
  }
  const filename = intermediatePath(projectId, key);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, JSON.stringify(value), 'utf8');
}

export async function getIntegrationAccount(provider: PublishingProvider) {
  if (!IS_VERCEL) return localDb.getIntegrationAccount(provider);
  return readB2Json<StoredIntegrationAccount>(`${B2_INTEGRATION_PREFIX}${provider}.json`);
}

export async function saveIntegrationAccount(account: StoredIntegrationAccount) {
  if (!IS_VERCEL) return localDb.saveIntegrationAccount(account);
  await writeB2Json(`${B2_INTEGRATION_PREFIX}${account.provider}.json`, account);
  return account;
}

export async function deleteIntegrationAccount(provider: PublishingProvider) {
  if (!IS_VERCEL) return localDb.deleteIntegrationAccount(provider);
  await deleteAllObjectVersions(`${B2_INTEGRATION_PREFIX}${provider}.json`, true);
}

export async function saveProject(project: Project) {
  project.updatedAt = new Date().toISOString();
  if (!IS_VERCEL) return localDb.saveProject(project);
  const key = projectMetadataKey(project.id);
  await assertCurrentProject(project.id);
  const stored = await writeB2Json(key, project);
  try {
    await assertCurrentProject(project.id);
  } catch (error) {
    await deleteObjectVersion(key, stored.VersionId);
    throw error;
  }
  return project;
}

export async function getProject(id: string) {
  if (!IS_VERCEL) return localDb.getProject(id);
  return readB2Json<Project>(projectMetadataKey(id));
}

export async function listProjects() {
  if (!IS_VERCEL) return localDb.listProjects();
  const current = await readB2Json<CurrentProjectPointer>(CURRENT_PROJECT_KEY);
  const keys = current
    ? [projectMetadataKey(current.id)]
    : (await listB2ObjectKeys(B2_PROJECT_METADATA_PREFIX)).filter((key) => key.endsWith('.json'));
  const projects = (await Promise.all(keys.map((key) => readB2Json<Project>(key))))
    .filter((project): project is Project => Boolean(project));
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(id: string) {
  if (!IS_VERCEL) {
    localDb.deleteProject(id);
    await rm(projectWorkspacePath(id), { recursive: true, force: true });
    return;
  }
  await Promise.all([
    deleteAllObjectVersions(projectObjectPrefix(id)),
    deleteAllObjectVersions(projectMetadataKey(id), true),
  ]);
}

/**
 * Brayo intentionally retains one project. This runs only after the new source
 * has been verified and its metadata has been saved, and always excludes the
 * new/current project from both object and metadata deletion.
 */
export async function pruneToCurrentProject(currentProjectId: string) {
  if (IS_VERCEL) {
    await pruneB2ToCurrentProject(currentProjectId);
    return;
  }
  const obsolete = localDb.listProjects().filter((project) => project.id !== currentProjectId);
  await Promise.all(obsolete.map(async (project) => {
    localDb.deleteProject(project.id);
    await rm(projectWorkspacePath(project.id), { recursive: true, force: true });
  }));
}

export async function assertCurrentProject(projectId: string) {
  if (!IS_VERCEL) return;
  const current = await readB2Json<CurrentProjectPointer>(CURRENT_PROJECT_KEY);
  if (!current || current.id !== projectId) throw new ProjectSupersededError(projectId);
}

/** Activate first, then clean. Existing workflow steps are fenced by the same
 * pointer and cannot recreate objects for a project that has been replaced. */
export async function activateCurrentProject(project: Project) {
  project.updatedAt = new Date().toISOString();
  if (!IS_VERCEL) {
    localDb.saveProject(project);
    await pruneToCurrentProject(project.id);
    return project;
  }
  await writeB2Json(CURRENT_PROJECT_KEY, { id: project.id, updatedAt: project.updatedAt } satisfies CurrentProjectPointer);
  const metadataKey = projectMetadataKey(project.id);
  const initial = await writeB2Json(metadataKey, project);
  try {
    await assertCurrentProject(project.id);
  } catch (error) {
    await deleteObjectVersion(metadataKey, initial.VersionId);
    throw error;
  }
  await pruneToCurrentProject(project.id);
  await assertCurrentProject(project.id);
  // Reassert current metadata after version-aware cleanup. This also protects
  // the winning upload from an overlapping cleanup snapshot.
  project.storageReady = true;
  const final = await writeB2Json(metadataKey, project);
  try {
    await assertCurrentProject(project.id);
  } catch (error) {
    await deleteObjectVersion(metadataKey, final.VersionId);
    throw error;
  }
  return project;
}
