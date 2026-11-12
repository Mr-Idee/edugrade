import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isIP } from 'node:net';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { createClient } from '@supabase/supabase-js';
import type { FullDatabaseSnapshot } from '../src/utils/sqlExportGenerator.ts';

interface LegacyEncryptedPayload {
  alg: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in your local environment before importing.`);
  return value;
}

function decryptLegacyVault(raw: string, key: Buffer): Record<string, unknown> {
  const envelope = JSON.parse(raw) as LegacyEncryptedPayload;
  if (
    envelope.alg !== 'AES-256-GCM' ||
    !envelope.iv ||
    !envelope.tag ||
    !envelope.ciphertext
  ) {
    throw new Error('The local authentication vault has an invalid encrypted envelope.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
  const parsed: unknown = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The decrypted authentication vault is not a user map.');
  }
  return parsed as Record<string, unknown>;
}

function encryptVault(vault: Record<string, unknown>, secret: string): string {
  const key = crypto.scryptSync(secret, 'edugrade-auth-vault-v1', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(vault), 'utf8'), cipher.final()]);
  return JSON.stringify({
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  });
}

async function main(): Promise<void> {
  const supabase = createClient(
    requiredEnvironment('SUPABASE_URL'),
    process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      (() => { throw new Error('Set SUPABASE_SECRET_KEY in your local environment before importing.'); })(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'edugrade_db',
    charset: 'utf8mb4'
  });

  try {
    const [rows] = await connection.query<(RowDataPacket & { state_json: string })[]>(
      'SELECT state_json FROM app_state_store WHERE id = 1 LIMIT 1'
    );
    if (!rows[0]?.state_json) {
      throw new Error('The MySQL app_state_store table has no canonical snapshot to import.');
    }
    const snapshot: unknown = JSON.parse(rows[0].state_json);
    if (
      !snapshot ||
      typeof snapshot !== 'object' ||
      !('schoolProfile' in snapshot) ||
      !Array.isArray((snapshot as FullDatabaseSnapshot).students)
    ) {
      throw new Error('The MySQL state row is not a valid EduGrade snapshot.');
    }
    const cloudSnapshot = structuredClone(snapshot as FullDatabaseSnapshot);
    let uploadedDocuments = 0;
    for (const document of cloudSnapshot.teacherDocumentUploads || []) {
      if (!document.fileStoragePath) continue;
      const sourceName = path.basename(document.fileStoragePath);
      const sourcePath = path.join(process.cwd(), 'database', 'teacher_uploads', sourceName);
      let bytes: Buffer;
      try {
        bytes = await fs.readFile(sourcePath);
      } catch {
        delete document.fileStoragePath;
        continue;
      }
      const storagePath = `${document.teacherId}/${document.id}/${sourceName}`;
      const { error } = await supabase.storage
        .from('edugrade-documents')
        .upload(storagePath, bytes, { upsert: true });
      if (error) throw new Error(`Could not import a legacy staff document: ${error.message}`);
      document.fileStoragePath = storagePath;
      uploadedDocuments += 1;
    }

    const revision = crypto.randomUUID();
    const { error: stateError } = await supabase.from('app_state_store').upsert({
      id: 1,
      state_json: cloudSnapshot,
      state_revision: revision,
      updated_at: new Date().toISOString()
    });
    if (stateError) throw new Error(`Could not import school records: ${stateError.message}`);

    const root = process.cwd();
    const legacyKey = Buffer.from(
      (await fs.readFile(path.join(root, 'database', '.vault_master.key'), 'utf8')).trim(),
      'hex'
    );
    if (legacyKey.length !== 32) {
      throw new Error('The local vault master key is missing or malformed.');
    }
    const oldVault = decryptLegacyVault(
      await fs.readFile(path.join(root, 'database', 'auth_vault_aes256gcm.enc'), 'utf8'),
      legacyKey
    );
    if (!Object.values(oldVault).some(
      value => value && typeof value === 'object' && (value as { role?: string }).role === 'SUPER_ADMIN'
    )) {
      throw new Error('The local authentication vault contains no Super Admin account.');
    }
    const { error: vaultError } = await supabase.from('auth_vault').upsert({
      id: 1,
      vault_ciphertext: encryptVault(oldVault, requiredEnvironment('AUTH_VAULT_ENCRYPTION_KEY')),
      updated_at: new Date().toISOString()
    });
    if (vaultError) throw new Error(`Could not import staff authentication: ${vaultError.message}`);

    const [offlineCommits] = await connection.query<
      (RowDataPacket & {
        commit_id: string;
        client_id: string;
        client_ip: string;
        actor_username: string | null;
        base_revision: string | null;
        committed_at: string;
        changed_at_json: string;
      })[]
    >(
      'SELECT commit_id, client_id, client_ip, actor_username, base_revision, committed_at, changed_at_json FROM offline_commit_archive'
    );
    if (offlineCommits.length) {
      const { error } = await supabase.from('offline_commit_archive').upsert(
        offlineCommits.map(commit => ({
          commit_id: commit.commit_id,
          client_id: commit.client_id,
          client_ip: isIP(commit.client_ip) ? commit.client_ip : '127.0.0.1',
          actor_username: commit.actor_username,
          base_revision: commit.base_revision,
          committed_at: new Date(commit.committed_at).toISOString(),
          changed_at_json:
            typeof commit.changed_at_json === 'string'
              ? JSON.parse(commit.changed_at_json)
              : commit.changed_at_json
        }))
      );
      if (error) throw new Error(`Could not import offline commit history: ${error.message}`);
    }

    console.log(JSON.stringify({
      imported: true,
      students: cloudSnapshot.students.length,
      staff: cloudSnapshot.teachers.length,
      documents: uploadedDocuments,
      offlineCommits: offlineCommits.length,
      stateRevision: revision,
      authVaultImported: true
    }));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'MySQL to Supabase import failed.');
  process.exitCode = 1;
});
