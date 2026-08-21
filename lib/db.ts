import { DatabaseSync } from 'node:sqlite';
import type { Project, PublishingProvider } from '@/types';
import { DB_PATH, ensureDataDirs } from '@/lib/paths';

declare global {
  // eslint-disable-next-line no-var
  var viralcutDb: DatabaseSync | undefined;
}

function database() {
  ensureDataDirs();
  if (!global.viralcutDb) {
    global.viralcutDb = new DatabaseSync(DB_PATH);
  }
  // Run idempotent schema creation even across Next.js hot reloads, where the
  // SQLite connection can outlive a newly added table migration.
  global.viralcutDb.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS integration_accounts (
      provider TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return global.viralcutDb;
}

export interface StoredIntegrationAccount {
  provider: PublishingProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  label: string;
  accountId?: string;
  scope?: string;
  autoPublish?: boolean;
}


export function getIntegrationAccount(provider: PublishingProvider): StoredIntegrationAccount | null {
  const row = database().prepare('SELECT data FROM integration_accounts WHERE provider = ?').get(provider) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as StoredIntegrationAccount) : null;
}

export function saveIntegrationAccount(account: StoredIntegrationAccount) {
  database()
    .prepare(`
      INSERT INTO integration_accounts (provider, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `)
    .run(account.provider, JSON.stringify(account), new Date().toISOString());
  return account;
}

export function deleteIntegrationAccount(provider: PublishingProvider) {
  database().prepare('DELETE FROM integration_accounts WHERE provider = ?').run(provider);
}

export function saveProject(project: Project) {
  project.updatedAt = new Date().toISOString();
  database()
    .prepare(`
      INSERT INTO projects (id, name, status, created_at, updated_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        status = excluded.status,
        updated_at = excluded.updated_at,
        data = excluded.data
    `)
    .run(project.id, project.name, project.status, project.createdAt, project.updatedAt, JSON.stringify(project));
  return project;
}

export function getProject(id: string): Project | null {
  const row = database().prepare('SELECT data FROM projects WHERE id = ?').get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Project) : null;
}

export function listProjects(): Project[] {
  const rows = database().prepare('SELECT data FROM projects ORDER BY updated_at DESC').all() as Array<{ data: string }>;
  return rows.map((row) => JSON.parse(row.data) as Project);
}

export function deleteProject(id: string) {
  database().prepare('DELETE FROM projects WHERE id = ?').run(id);
}
