import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZipArchive } from 'archiver';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  mergePendingOfflineSnapshot,
  omitSessionArchives,
  type OfflineConflictResolution,
  type PendingOfflineSnapshot
} from '../src/utils/offlineSyncEngine.ts';
import {
  normalizeEnrollmentIds,
  type FullDatabaseSnapshot
} from '../src/utils/sqlExportGenerator.ts';

type UserRole =
  | 'SUPER_ADMIN'
  | 'PRINCIPAL'
  | 'HEAD_OF_SCHOOLS'
  | 'VICE_PRINCIPAL'
  | 'CLASS_TEACHER'
  | 'SUBJECT_TEACHER';

interface EncryptedUserCredential {
  username: string;
  fullName: string;
  role: UserRole;
  initialPin?: string;
  saltHex?: string;
  hashHex?: string;
  hasPasswordSet?: boolean;
  mustSetPassword: boolean;
  passwordResetRequested: boolean;
  passwordResetRequestedAt?: string;
  updatedAt: string;
}

interface SessionIdentity {
  username: string;
  issuedAt: number;
  expiresAt: number;
}

interface StateRow {
  state_json: FullDatabaseSnapshot;
  state_revision: string;
  updated_at: string;
}

interface StateMetadata {
  state_revision: string;
  updated_at: string;
}

const SESSION_COOKIE = 'edugrade_session';
const require = createRequire(import.meta.url);
const compression = require('compression') as typeof import('compression');
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ADMIN_ROLES = new Set<UserRole>([
  'SUPER_ADMIN',
  'PRINCIPAL',
  'HEAD_OF_SCHOOLS',
  'VICE_PRINCIPAL'
]);
const USER_ROLES = new Set<UserRole>([
  ...ADMIN_ROLES,
  'CLASS_TEACHER',
  'SUBJECT_TEACHER'
]);
const app = express();
let supabaseClient: SupabaseClient | null = null;
let warnedMissingLoadFunction = false;

app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '19mb' }));

function getRequiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function getSupabase(): SupabaseClient {
  if (supabaseClient) return supabaseClient;
  const url = getRequiredEnvironment('SUPABASE_URL');
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    throw new Error('Missing required server environment variable: SUPABASE_SECRET_KEY');
  }
  supabaseClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return supabaseClient;
}

function getSessionSecret(): string {
  return getRequiredEnvironment('SESSION_SECRET');
}

function getVaultKey(): Buffer {
  return crypto.scryptSync(
    getRequiredEnvironment('AUTH_VAULT_ENCRYPTION_KEY'),
    'edugrade-auth-vault-v1',
    32
  );
}

function encryptVault(vault: Record<string, EncryptedUserCredential>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getVaultKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(vault), 'utf8'),
    cipher.final()
  ]);
  return JSON.stringify({
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  });
}

function decryptVault(raw: string): Record<string, EncryptedUserCredential> {
  const envelope = JSON.parse(raw);
  if (
    envelope?.alg !== 'AES-256-GCM' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.tag !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new Error('Stored authentication vault has an invalid encrypted envelope.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getVaultKey(),
    Buffer.from(envelope.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const json = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
  const vault: unknown = JSON.parse(json);
  if (!vault || typeof vault !== 'object' || Array.isArray(vault)) {
    throw new Error('Stored authentication vault is not a user map.');
  }
  return vault as Record<string, EncryptedUserCredential>;
}

async function loadVault(): Promise<Record<string, EncryptedUserCredential>> {
  const { data, error } = await getSupabase()
    .from('auth_vault')
    .select('vault_ciphertext')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`Could not load authentication vault: ${error.message}`);
  if (!data) return {};
  return decryptVault(data.vault_ciphertext);
}

async function saveVault(vault: Record<string, EncryptedUserCredential>): Promise<void> {
  const { error } = await getSupabase().from('auth_vault').upsert({
    id: 1,
    vault_ciphertext: encryptVault(vault),
    updated_at: new Date().toISOString()
  });
  if (error) throw new Error(`Could not save authentication vault: ${error.message}`);
}

function hashPassword(password: string): { saltHex: string; hashHex: string } {
  const salt = crypto.randomBytes(16);
  return {
    saltHex: salt.toString('hex'),
    hashHex: crypto.scryptSync(password, salt, 64).toString('hex')
  };
}

function verifyPassword(password: string, record: EncryptedUserCredential): boolean {
  if (!record.saltHex || !record.hashHex) return false;
  try {
    const storedHash = Buffer.from(record.hashHex, 'hex');
    const derivedHash = crypto.scryptSync(password, Buffer.from(record.saltHex, 'hex'), 64);
    return storedHash.length === derivedHash.length && crypto.timingSafeEqual(storedHash, derivedHash);
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signSession(identity: SessionIdentity): string {
  const payload = Buffer.from(JSON.stringify(identity)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function parseSession(value: string | undefined): SessionIdentity | null {
  if (!value) return null;
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra) return null;
  const expected = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as SessionIdentity).username !== 'string' ||
      typeof (parsed as SessionIdentity).expiresAt !== 'number' ||
      (parsed as SessionIdentity).expiresAt <= Date.now()
    ) return null;
    return parsed as SessionIdentity;
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | undefined {
  const prefix = `${name}=`;
  return request.headers.cookie
    ?.split(';')
    .map(item => item.trim())
    .find(item => item.startsWith(prefix))
    ?.slice(prefix.length);
}

function setSessionCookie(response: Response, request: Request, username: string): void {
  const now = Date.now();
  const value = signSession({
    username,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1000
  });
  response.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: request.secure || process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000
  });
}

function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}

function rejectCrossOriginMutation(request: Request, response: Response): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  const origin = request.get('origin');
  if (!origin) return false;
  try {
    if (new URL(origin).host !== request.get('host')) {
      response.status(403).json({ ok: false, error: 'Cross-origin request rejected.' });
      return true;
    }
  } catch {
    response.status(403).json({ ok: false, error: 'Invalid request origin.' });
    return true;
  }
  return false;
}

interface AuthenticatedRequest extends Request {
  auth?: { username: string; record: EncryptedUserCredential };
}

async function requireUser(
  request: AuthenticatedRequest,
  response: Response,
  roles?: Set<UserRole>
): Promise<boolean> {
  try {
    const session = parseSession(cookieValue(request, SESSION_COOKIE));
    if (!session) {
      response.status(401).json({ ok: false, error: 'Please sign in to continue.' });
      return false;
    }
    const vault = await loadVault();
    const record = vault[session.username];
    if (!record || record.mustSetPassword || !record.hashHex || !record.saltHex) {
      clearSessionCookie(response);
      response.status(401).json({ ok: false, error: 'This staff account is not active.' });
      return false;
    }
    if (roles && !roles.has(record.role)) {
      response.status(403).json({ ok: false, error: 'This action requires an administrator account.' });
      return false;
    }
    request.auth = { username: session.username, record };
    return true;
  } catch (error) {
    response.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Authentication service is unavailable.'
    });
    return false;
  }
}

function getSnapshot(value: unknown): value is FullDatabaseSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<FullDatabaseSnapshot>;
  return Boolean(
    snapshot.schoolProfile &&
    Array.isArray(snapshot.sessions) &&
    Array.isArray(snapshot.terms) &&
    Array.isArray(snapshot.classSections) &&
    Array.isArray(snapshot.teachers) &&
    Array.isArray(snapshot.subjects) &&
    Array.isArray(snapshot.students) &&
    Array.isArray(snapshot.assessmentComponents) &&
    Array.isArray(snapshot.enrollments) &&
    Array.isArray(snapshot.scores) &&
    Array.isArray(snapshot.termSubjectRecords) &&
    Array.isArray(snapshot.termSummaries) &&
    Array.isArray(snapshot.auditLogs) &&
    Array.isArray(snapshot.commentBank)
  );
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function wrapSupabaseError(message: string, error: { message: string; code?: string }): Error {
  const wrapped = new Error(`${message}: ${error.message}`);
  if (error.code) Object.assign(wrapped, { code: error.code });
  return wrapped;
}

async function loadState(): Promise<StateRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('load_app_state');
  if (error && !['PGRST202', '42883'].includes(error.code || '')) {
    throw wrapSupabaseError('Could not load school records from Supabase', error);
  }
  if (error) {
    if (!warnedMissingLoadFunction) {
      console.warn('Supabase load_app_state migration is pending; using a direct state read temporarily.');
      warnedMissingLoadFunction = true;
    }
    const fallback = await supabase
      .from('app_state_store')
      .select('state_json,state_revision,updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (fallback.error) {
      throw wrapSupabaseError('Could not load school records from Supabase', fallback.error);
    }
    if (!fallback.data) return null;
    return {
      ...fallback.data,
      state_json: omitSessionArchives(fallback.data.state_json) as FullDatabaseSnapshot
    } as StateRow;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const stateRow = row as StateRow;
  return {
    ...stateRow,
    state_json: omitSessionArchives(stateRow.state_json) as FullDatabaseSnapshot
  };
}

async function loadStateMetadata(): Promise<StateMetadata | null> {
  const { data, error } = await getSupabase()
    .from('app_state_store')
    .select('state_revision,updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw wrapSupabaseError('Could not load school record metadata from Supabase', error);
  return data as StateMetadata | null;
}

function isAdmin(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}

function filterSnapshotForStaff(
  snapshot: FullDatabaseSnapshot,
  identity: { username: string; record: EncryptedUserCredential }
): FullDatabaseSnapshot {
  if (isAdmin(identity.record.role)) return snapshot;
  const teacher = snapshot.teachers.find(
    item => (item.username || '').toLowerCase() === identity.username
  );
  const sectionIds = new Set<number>();
  const subjectIds = new Set<number>();
  if (teacher?.assignedSectionId) sectionIds.add(teacher.assignedSectionId);
  for (const assignment of teacher?.assignedSubjects || []) {
    sectionIds.add(assignment.sectionId);
    subjectIds.add(assignment.subjectId);
  }
  const students = snapshot.students.filter(student => sectionIds.has(student.currentSectionId));
  const studentIds = new Set(students.map(student => student.id));
  const subjectFilter = (subjectId: number) => !subjectIds.size || subjectIds.has(subjectId);
  const sections = snapshot.classSections.filter(section => sectionIds.has(section.id));
  const scoped: FullDatabaseSnapshot = {
    ...snapshot,
    classSections: sections,
    teachers: teacher ? [teacher] : [],
    subjects: snapshot.subjects.filter(subject => subjectFilter(subject.id)),
    students,
    enrollments: snapshot.enrollments.filter(
      enrollment =>
        sectionIds.has(enrollment.sectionId) &&
        studentIds.has(enrollment.studentId) &&
        subjectFilter(enrollment.subjectId)
    ),
    scores: snapshot.scores.filter(
      score => studentIds.has(score.studentId) && subjectFilter(score.subjectId)
    ),
    termSubjectRecords: snapshot.termSubjectRecords.filter(
      record => studentIds.has(record.studentId) && subjectFilter(record.subjectId)
    ),
    termSummaries: snapshot.termSummaries.filter(
      summary => sectionIds.has(summary.sectionId) && studentIds.has(summary.studentId)
    ),
    auditLogs: [],
    customReportTemplates: (snapshot.customReportTemplates || []).filter(template =>
      sectionIds.has(template.sectionId)
    ),
    sessionArchives: [],
    promotionLogs: [],
    officeMessages: (snapshot.officeMessages || []).filter(message =>
      String(message.recipientTeacherId) === String(teacher?.id) ||
      message.senderName === teacher?.fullName
    ),
    teacherDocumentUploads: (snapshot.teacherDocumentUploads || []).filter(
      document =>
        document.teacherId === teacher?.id ||
        (sectionIds.has(document.sectionId) && subjectFilter(document.subjectId))
    ),
    studentTestimonials: (snapshot.studentTestimonials || []).filter(testimonial =>
      studentIds.has(testimonial.studentId)
    ),
    academicDepartments: (snapshot.academicDepartments || []).filter(
      department => department.hodTeacherId === teacher?.id
    )
  };
  return scoped;
}

function mergeScopedSnapshot(
  current: FullDatabaseSnapshot,
  submitted: FullDatabaseSnapshot,
  identity: { username: string; record: EncryptedUserCredential }
): FullDatabaseSnapshot {
  if (isAdmin(identity.record.role)) return normalizeEnrollmentIds(submitted);
  const teacher = current.teachers.find(
    item => (item.username || '').toLowerCase() === identity.username
  );
  const sectionIds = new Set<number>();
  const subjectIds = new Set<number>();
  if (teacher?.assignedSectionId) sectionIds.add(teacher.assignedSectionId);
  for (const assignment of teacher?.assignedSubjects || []) {
    sectionIds.add(assignment.sectionId);
    subjectIds.add(assignment.subjectId);
  }
  const studentIds = new Set(
    current.students
      .filter(student => sectionIds.has(student.currentSectionId))
      .map(student => student.id)
  );
  const canEdit = (record: { studentId: number; subjectId: number }) =>
    studentIds.has(record.studentId) &&
    (!subjectIds.size || subjectIds.has(record.subjectId));
  const mergeById = <T extends { id: number }>(
    existing: T[],
    incoming: T[],
    allowed: (value: T) => boolean
  ): T[] => {
    const preserved = existing.filter(value => !allowed(value));
    const replacements = incoming.filter(allowed);
    return [...preserved, ...replacements];
  };
  const mergeScopedRecords = <T extends { studentId: number; subjectId: number }>(
    existing: T[],
    incoming: T[]
  ) => mergeById(existing as Array<T & { id: number }>, incoming as Array<T & { id: number }>, canEdit) as T[];
  const merged: FullDatabaseSnapshot = {
    ...current,
    scores: mergeScopedRecords(current.scores, submitted.scores),
    termSubjectRecords: mergeScopedRecords(current.termSubjectRecords, submitted.termSubjectRecords),
    termSummaries: mergeById(
      current.termSummaries,
      submitted.termSummaries,
      summary => sectionIds.has(summary.sectionId) && studentIds.has(summary.studentId)
    ),
    officeMessages: [
      ...(current.officeMessages || []).filter(message => message.senderName !== teacher?.fullName),
      ...(submitted.officeMessages || []).filter(message => message.senderName === teacher?.fullName)
    ],
    teacherDocumentUploads: [
      ...(current.teacherDocumentUploads || []).filter(document => document.teacherId !== teacher?.id),
      ...(submitted.teacherDocumentUploads || []).filter(document => document.teacherId === teacher?.id)
    ]
  };
  return normalizeEnrollmentIds(merged);
}

async function saveState(
  snapshot: FullDatabaseSnapshot,
  expectedRevision: string | null
): Promise<{ stateRevision: string; updatedAt: string }> {
  const { data, error } = await getSupabase().rpc('save_app_state', {
    p_state: omitSessionArchives(snapshot),
    p_expected_revision: expectedRevision
  });
  if (error) {
    if (error.code === '40001') {
      const conflict = new Error('School records changed while you were editing. Reload before saving.');
      Object.assign(conflict, { status: 409 });
      throw conflict;
    }
    throw wrapSupabaseError('Could not save school records to Supabase', error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.state_revision || !row?.updated_at) {
    throw new Error('Supabase saved the state but returned no revision metadata.');
  }
  return { stateRevision: row.state_revision, updatedAt: row.updated_at };
}

function decodeRequestBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid JSON request body.');
  }
  const encoded = (body as Record<string, unknown>).__edugrade_gzip_base64;
  if (typeof encoded !== 'string') return body as Record<string, unknown>;
  const compressed = Buffer.from(encoded, 'base64');
  if (compressed.length > 4 * 1024 * 1024) {
    throw new Error('Compressed request exceeds the supported limit.');
  }
  const json = gunzipSync(compressed, { maxOutputLength: 20 * 1024 * 1024 }).toString('utf8');
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Compressed request did not contain a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function getExpectedRevision(request: Request, body: Record<string, unknown>): string | null {
  const value = body.stateRevision ?? request.get('if-match') ?? null;
  return typeof value === 'string' && value.trim() ? value.replace(/^W\/|"/g, '') : null;
}

function authorizedDocumentPath(snapshot: FullDatabaseSnapshot, id: string): string | null {
  return (snapshot.teacherDocumentUploads || []).find(document => document.id === id)
    ?.fileStoragePath || null;
}

function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'document';
}

function decodeFileDataUrl(dataUrl: unknown): { bytes: Buffer; mimeType: string } {
  if (typeof dataUrl !== 'string') throw new Error('A file payload is required.');
  const match = /^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) throw new Error('The uploaded file is not a valid base64 data URL.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) {
    throw new Error('The file is empty or exceeds the 15 MB upload limit.');
  }
  return { bytes, mimeType: match[1] };
}

function writeDownload(response: Response, filename: string, mimeType: string, bytes: Buffer): void {
  response.setHeader('Content-Type', mimeType || 'application/octet-stream');
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeFileName(filename).replace(/"/g, '')}"`
  );
  response.setHeader('Content-Length', bytes.length);
  response.send(bytes);
}

app.use((request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  if (rejectCrossOriginMutation(request, response)) return;
  next();
});

app.get('/api/health', async (_request, response) => {
  try {
    const { error } = await getSupabase().from('app_state_store').select('id').limit(1);
    if (error) throw new Error(error.message);
    response.json({ ok: true, storageMode: 'SUPABASE_LIVE' });
  } catch (error) {
    response.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Supabase is unavailable.'
    });
  }
});

app.get('/api/db/status', async (_request, response) => {
  try {
    const row = await loadStateMetadata();
    response.json({
      ok: true,
      nodeVersion: process.version,
      databaseConnected: true,
      storageMode: 'SUPABASE_LIVE',
      dbConfig: { database: 'Supabase PostgreSQL', user: 'service_role', hasPassword: true },
      lastSyncedAt: row?.updated_at || null,
      stateRevision: row?.state_revision || null,
      sqlDumpFile: { sizeKb: 0 }
    });
  } catch (error) {
    response.status(503).json({
      ok: false,
      errorMessage: error instanceof Error ? error.message : 'Supabase is unavailable.'
    });
  }
});

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const username = String(request.body?.username || '').trim().toLowerCase();
    const password = String(request.body?.password || '');
    const pin = String(request.body?.initialPin || '');
    if (!username || (!password && !pin)) {
      response.status(400).json({ ok: false, error: 'Username and password are required.' });
      return;
    }

    const key = crypto.createHmac('sha256', getSessionSecret())
      .update(`${request.ip || 'unknown'}:${username}`)
      .digest('hex');
    const { data: allowed, error: limitError } = await getSupabase().rpc('consume_auth_attempt', {
      p_bucket_key: key,
      p_max_attempts: 5,
      p_window_seconds: 900
    });
    if (limitError) throw new Error(`Could not check login rate limit: ${limitError.message}`);
    if (!allowed) {
      response.status(429).json({ ok: false, error: 'Too many sign-in attempts. Try again in 15 minutes.' });
      return;
    }

    const vault = await loadVault();
    const record = vault[username];
    if (!record) {
      response.status(401).json({ ok: false, error: 'Invalid username or password.' });
      return;
    }
    if (record.mustSetPassword || !record.hashHex || !record.saltHex) {
      if (!record.initialPin || !pin || !safeEqual(pin, record.initialPin)) {
        response.status(401).json({ ok: false, error: 'Invalid username or initial PIN.' });
        return;
      }
      response.json({
        ok: true,
        requiresPasswordSetup: true,
        username,
        fullName: record.fullName,
        role: record.role
      });
      return;
    }
    if (!password || !verifyPassword(password, record)) {
      response.status(401).json({ ok: false, error: 'Invalid username or password.' });
      return;
    }
    setSessionCookie(response, request, username);
    response.json({
      ok: true,
      requiresPasswordSetup: false,
      username,
      fullName: record.fullName,
      role: record.role
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (_request, response) => {
  clearSessionCookie(response);
  response.json({ ok: true });
});

app.post('/api/auth/set-password', async (request, response, next) => {
  try {
    const username = String(request.body?.username || '').trim().toLowerCase();
    const initialPin = String(request.body?.initialPin || '').trim();
    const newPassword = String(request.body?.newPassword || '');
    if (newPassword.length <= 8 || !/[A-Z]/.test(newPassword) || !/[\d\W]/.test(newPassword)) {
      response.status(400).json({
        ok: false,
        error: 'Password must be longer than 8 characters and include an uppercase letter and a number or symbol.'
      });
      return;
    }
    const vault = await loadVault();
    const record = vault[username];
    if (!record || !record.initialPin || !safeEqual(initialPin, record.initialPin)) {
      response.status(401).json({ ok: false, error: 'Invalid username or initial PIN.' });
      return;
    }
    const { saltHex, hashHex } = hashPassword(newPassword);
    vault[username] = {
      ...record,
      saltHex,
      hashHex,
      initialPin: undefined,
      mustSetPassword: false,
      hasPasswordSet: true,
      passwordResetRequested: false,
      passwordResetRequestedAt: undefined,
      updatedAt: new Date().toISOString()
    };
    await saveVault(vault);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/verify-super-admin', async (request, response, next) => {
  try {
    const username = String(request.body?.username || '').trim().toLowerCase();
    const record = (await loadVault())[username];
    if (
      !record ||
      record.role !== 'SUPER_ADMIN' ||
      !verifyPassword(String(request.body?.password || ''), record)
    ) {
      response.status(401).json({ ok: false, error: 'Super Admin credentials are invalid.' });
      return;
    }
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register-passwordless', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response, ADMIN_ROLES))) return;
    const username = String(request.body?.username || '').trim().toLowerCase();
    const fullName = String(request.body?.fullName || '').trim();
    const role = String(request.body?.role || 'CLASS_TEACHER') as UserRole;
    if (!username || !fullName || !USER_ROLES.has(role)) {
      response.status(400).json({ ok: false, error: 'Valid name, username, and staff role are required.' });
      return;
    }
    if (role === 'SUPER_ADMIN' && request.auth?.record.role !== 'SUPER_ADMIN') {
      response.status(403).json({ ok: false, error: 'Only a Super Admin can create another Super Admin.' });
      return;
    }
    const vault = await loadVault();
    const initialPin = crypto.randomInt(1000, 10000).toString();
    const record: EncryptedUserCredential = {
      username,
      fullName,
      role,
      initialPin,
      mustSetPassword: true,
      passwordResetRequested: false,
      updatedAt: new Date().toISOString()
    };
    vault[username] = record;
    await saveVault(vault);
    response.json({ ok: true, account: { ...record, hasPasswordSet: false } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/request-reset', async (request, response, next) => {
  try {
    const username = String(request.body?.username || '').trim().toLowerCase();
    if (username) {
      const vault = await loadVault();
      const record = vault[username];
      if (record) {
        vault[username] = {
          ...record,
          passwordResetRequested: true,
          passwordResetRequestedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await saveVault(vault);
      }
    }
    response.json({ ok: true, message: 'If the account exists, the reset request was submitted.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/approve-reset', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response, ADMIN_ROLES))) return;
    const username = String(request.body?.username || '').trim().toLowerCase();
    const vault = await loadVault();
    const record = vault[username];
    if (!record) {
      response.status(404).json({ ok: false, error: 'Staff account not found.' });
      return;
    }
    const newPin = String(request.body?.newPin || '');
    if (!/^\d{4}$/.test(newPin)) {
      response.status(400).json({ ok: false, error: 'A valid four-digit reset PIN is required.' });
      return;
    }
    vault[username] = {
      ...record,
      initialPin: newPin,
      saltHex: undefined,
      hashHex: undefined,
      mustSetPassword: true,
      hasPasswordSet: false,
      passwordResetRequested: false,
      passwordResetRequestedAt: undefined,
      updatedAt: new Date().toISOString()
    };
    await saveVault(vault);
    response.json({ ok: true, newPin });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/update-staff-credentials', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response))) return;
    const actor = request.auth!;
    const isAdmin = ADMIN_ROLES.has(actor.record.role);
    const isSelf = Number(request.body?.teacherId) > 0 &&
      String(request.body?.actorUsername || '').trim().toLowerCase() === actor.username;
    if (!isAdmin && !isSelf) {
      response.status(403).json({ ok: false, error: 'You may update only your own staff credentials.' });
      return;
    }
    if (!verifyPassword(String(request.body?.actorCredential || ''), actor.record)) {
      response.status(401).json({ ok: false, error: 'Account credentials are invalid.' });
      return;
    }
    const newUsername = String(request.body?.newUsername || '').trim().toLowerCase();
    const fullName = String(request.body?.fullName || '').trim();
    if (!newUsername || !fullName) {
      response.status(400).json({ ok: false, error: 'Full name and username are required.' });
      return;
    }
    const vault = await loadVault();
    const targetUsername = isSelf ? actor.username : String(request.body?.username || '').trim().toLowerCase();
    const target = vault[targetUsername];
    if (!target) {
      response.status(404).json({ ok: false, error: 'Staff account not found.' });
      return;
    }
    if (newUsername !== targetUsername && vault[newUsername]) {
      response.status(409).json({ ok: false, error: 'That username is already in use.' });
      return;
    }
    const nextTarget: EncryptedUserCredential = {
      ...target,
      username: newUsername,
      fullName,
      updatedAt: new Date().toISOString()
    };
    if (request.body?.newPassword) {
      const password = String(request.body.newPassword);
      if (password.length <= 8 || !/[A-Z]/.test(password) || !/[\d\W]/.test(password)) {
        response.status(400).json({ ok: false, error: 'The new password does not meet the password requirements.' });
        return;
      }
      Object.assign(nextTarget, hashPassword(password), {
        initialPin: undefined,
        mustSetPassword: false,
        hasPasswordSet: true,
        passwordResetRequested: false
      });
    }
    delete vault[targetUsername];
    vault[newUsername] = nextTarget;
    await saveVault(vault);
    if (isSelf) setSessionCookie(response, request, newUsername);
    response.json({
      ok: true,
      username: newUsername,
      fullName,
      passwordUpdated: Boolean(request.body?.newPassword)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/state', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response))) return;
    const row = await loadState();
    response.json({
      ok: true,
      hasPersistedState: Boolean(row),
      databaseConnected: true,
      storageMode: 'SUPABASE_LIVE',
      stateRevision: row?.state_revision || null,
      state: row ? filterSnapshotForStaff(row.state_json, request.auth!) : null
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/state', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response))) return;
    const body = decodeRequestBody(request.body);
    const submitted = body.snapshot ?? body;
    if (!getSnapshot(submitted)) {
      response.status(400).json({ ok: false, error: 'Invalid school database snapshot.' });
      return;
    }
    const admin = isAdmin(request.auth!.record.role);
    const current = admin ? null : await loadState();
    const currentMetadata = admin ? await loadStateMetadata() : current;
    if (!currentMetadata && !admin) {
      response.status(403).json({ ok: false, error: 'An administrator must initialize school data first.' });
      return;
    }
    const expectedRevision = getExpectedRevision(request, body);
    const currentRevision = currentMetadata?.state_revision || null;
    if (currentRevision && expectedRevision && expectedRevision !== currentRevision) {
      response.status(409).json({
        ok: false,
        error: 'School records changed while you were editing. Reload before saving.',
        stateRevision: currentRevision
      });
      return;
    }
    const snapshot = !admin && current
      ? mergeScopedSnapshot(current.state_json, submitted, request.auth!)
      : normalizeEnrollmentIds(submitted);
    const saved = await saveState(snapshot, currentRevision);
    response.json({
      ok: true,
      databaseConnected: true,
      storageMode: 'SUPABASE_LIVE',
      savedToNodeDisk: false,
      savedToDatabase: true,
      stateRevision: saved.stateRevision,
      syncedAt: saved.updatedAt
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/state/offline-commit', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response))) return;
    const body = decodeRequestBody(request.body);
    const queue = body.queue as PendingOfflineSnapshot<FullDatabaseSnapshot> | undefined;
    if (!queue || !getSnapshot(queue.snapshot) || !getSnapshot(queue.baseSnapshot)) {
      response.status(400).json({ ok: false, error: 'Invalid offline snapshot payload.' });
      return;
    }
    const currentRow = await loadState();
    if (!currentRow) {
      response.status(409).json({ ok: false, error: 'Initialize the school database before committing offline changes.' });
      return;
    }
    const serverSnapshot = filterSnapshotForStaff(currentRow.state_json, request.auth!);
    const merge = mergePendingOfflineSnapshot(
      serverSnapshot,
      queue,
      currentRow.state_revision,
      (body.resolutions || {}) as Record<string, OfflineConflictResolution>
    );
    if (!merge.snapshot || merge.conflicts.length) {
      response.status(409).json({
        ok: false,
        error: 'Offline changes conflict with newer Supabase records.',
        conflicts: merge.conflicts
      });
      return;
    }
    const merged = mergeScopedSnapshot(currentRow.state_json, merge.snapshot, request.auth!);
    const saved = await saveState(merged, currentRow.state_revision);
    const persistedSnapshot = omitSessionArchives(merged) as FullDatabaseSnapshot;
    const commitId = String(body.commitId || request.get('x-offline-commit-id') || '');
    if (commitId) {
      const { error } = await getSupabase().from('offline_commit_archive').upsert({
        commit_id: commitId,
        client_id: String(body.clientId || request.get('x-offline-client-id') || 'unknown'),
        client_ip: request.ip || '127.0.0.1',
        actor_username: request.auth!.username,
        base_revision: queue.baseRevision,
        committed_at: saved.updatedAt,
        changed_at_json: queue.changedAt || {}
      });
      if (error) throw new Error(`School state was saved, but offline history could not be recorded: ${error.message}`);
    }
    response.json({
      ok: true,
      state: filterSnapshotForStaff(persistedSnapshot, request.auth!),
      stateRevision: saved.stateRevision,
      savedToNodeDisk: false,
      savedToDatabase: true,
      conflicts: []
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/db/init', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response, ADMIN_ROLES))) return;
    const body = decodeRequestBody(request.body);
    const submitted = body.snapshot ?? body;
    if (!getSnapshot(submitted)) {
      response.status(400).json({ ok: false, error: 'Invalid school database snapshot.' });
      return;
    }
    const current = await loadState();
    const saved = await saveState(normalizeEnrollmentIds(submitted), current?.state_revision || null);
    response.json({
      ok: true,
      databaseConnected: true,
      storageMode: 'SUPABASE_LIVE',
      savedToDatabase: true,
      savedToNodeDisk: false,
      state: submitted,
      stateRevision: saved.stateRevision,
      tablesVerified: ['app_state_store'],
      message: 'School records are stored in Supabase PostgreSQL.'
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/backups', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response, new Set(['SUPER_ADMIN'])))) return;
    const { data, error } = await getSupabase()
      .from('system_backups')
      .select('id,created_at,created_by,label,file_name,payload')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Could not load system backups: ${error.message}`);
    response.json({
      ok: true,
      backups: (data || []).map(record => ({
        id: record.id,
        createdAt: record.created_at,
        createdBy: record.created_by,
        label: record.label,
        fileName: record.file_name,
        payload: record.payload
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/backups', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response, new Set(['SUPER_ADMIN'])))) return;
    const backup = request.body;
    if (!backup?.id || !backup?.payload || typeof backup.payload !== 'object') {
      response.status(400).json({ ok: false, error: 'A valid system backup is required.' });
      return;
    }
    const { error } = await getSupabase().from('system_backups').upsert({
      id: String(backup.id),
      created_at: String(backup.createdAt || new Date().toISOString()),
      created_by: request.auth!.username,
      label: String(backup.label || 'EduGrade backup'),
      file_name: String(backup.fileName || `${backup.id}.json`),
      payload: backup.payload
    });
    if (error) throw new Error(`Could not save system backup: ${error.message}`);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/backups/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response, new Set(['SUPER_ADMIN'])))) return;
    const { error } = await getSupabase().from('system_backups').delete().eq('id', request.params.id);
    if (error) throw new Error(`Could not delete system backup: ${error.message}`);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents/upload', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response))) return;
    const { bytes, mimeType } = decodeFileDataUrl(request.body?.fileDataUrl);
    const fileName = sanitizeFileName(String(request.body?.fileName || 'document'));
    const id = String(request.body?.id || crypto.randomUUID());
    const storagePath = `${request.auth!.username}/${id}/${fileName}`;
    const { error } = await getSupabase().storage.from('edugrade-documents').upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: true
    });

    app.post('/api/documents/upload-url', async (request: AuthenticatedRequest, response, next) => {
      try {
        if (!(await requireUser(request, response))) return;
        const id = String(request.body?.id || crypto.randomUUID());
        const fileName = sanitizeFileName(String(request.body?.fileName || 'document'));
        const storagePath = `${request.auth!.username}/${id}/${fileName}`;
        const { data, error } = await getSupabase()
          .storage.from('edugrade-documents')
          .createSignedUploadUrl(storagePath);
        if (error || !data?.token) {
          throw new Error(`Could not create a signed document upload: ${error?.message || 'missing upload token'}`);
        }
        response.json({ ok: true, id, fileName, fileStoragePath: storagePath, token: data.token });
      } catch (error) {
        next(error);
      }
    });

    app.post('/api/documents/complete-upload', async (request: AuthenticatedRequest, response, next) => {
      try {
        if (!(await requireUser(request, response))) return;
        const storagePath = String(request.body?.fileStoragePath || '');
        const id = String(request.body?.id || '');
        const fileName = sanitizeFileName(String(request.body?.fileName || 'document'));
        if (!id || !storagePath.startsWith(`${request.auth!.username}/${id}/`)) {
          response.status(400).json({ ok: false, error: 'Invalid document upload reference.' });
          return;
        }
        const directory = storagePath.slice(0, storagePath.lastIndexOf('/'));
        const storedName = storagePath.slice(storagePath.lastIndexOf('/') + 1);
        const { data, error } = await getSupabase()
          .storage.from('edugrade-documents')
          .list(directory, { search: storedName, limit: 1 });
        if (error) throw new Error(`Could not verify the uploaded document: ${error.message}`);
        const object = data?.find(item => item.name === storedName);
        if (!object) {
          response.status(404).json({ ok: false, error: 'The uploaded file was not found in Supabase Storage.' });
          return;
        }
        const size = Number(object.metadata?.size || 0);
        response.json({
          ok: true,
          id,
          fileName,
          fileSizeKb: Math.max(1, Math.round(size / 1024)),
          fileStoragePath: storagePath
        });
      } catch (error) {
        next(error);
      }
    });
    if (error) throw new Error(`Could not store document in Supabase Storage: ${error.message}`);
    response.json({
      ok: true,
      id,
      fileName,
      fileSizeKb: Math.max(1, Math.round(bytes.length / 1024)),
      fileStoragePath: storagePath
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/documents/download/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response))) return;
    const row = await loadState();
    if (!row || !authorizedDocumentPath(filterSnapshotForStaff(row.state_json, request.auth!), request.params.id)) {
      response.status(404).json({ ok: false, error: 'Document not found or you do not have access to it.' });
      return;
    }
    const document = row.state_json.teacherDocumentUploads?.find(item => item.id === request.params.id);
    const filePath = document?.fileStoragePath;
    if (!filePath) {
      response.status(404).json({ ok: false, error: 'The document has no stored file path.' });
      return;
    }
    const { data, error } = await getSupabase().storage.from('edugrade-documents').download(filePath);
    if (error || !data) throw new Error(`Could not download stored document: ${error?.message || 'empty file'}`);
    writeDownload(response, document.fileName, document.fileType || 'application/octet-stream', Buffer.from(await data.arrayBuffer()));
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents/bulk-download', async (request: AuthenticatedRequest, response, next) => {
  try {
    if (!(await requireUser(request, response))) return;
    const ids = Array.isArray(request.body?.documentIds)
      ? request.body.documentIds.map((id: unknown) => String(id))
      : Array.isArray(request.body?.documents)
      ? request.body.documents.map((item: { id?: unknown }) => String(item.id || ''))
      : [];
    const row = await loadState();
    if (!row) {
      response.status(404).json({ ok: false, error: 'No school records are stored.' });
      return;
    }
    const visible = filterSnapshotForStaff(row.state_json, request.auth!);
    const requested = ids
      .map((id: string) => visible.teacherDocumentUploads?.find(document => document.id === id))
      .filter((document: NonNullable<FullDatabaseSnapshot['teacherDocumentUploads']>[number] | undefined) =>
        Boolean(document?.fileStoragePath)
      );
    if (!requested.length) {
      response.status(404).json({ ok: false, error: 'No accessible documents were selected.' });
      return;
    }
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', 'attachment; filename="edugrade-documents.zip"');
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on('error', next);
    archive.pipe(response);
    for (const document of requested) {
      const { data, error } = await getSupabase()
        .storage.from('edugrade-documents')
        .download(document.fileStoragePath!);
      if (error || !data) throw new Error(`Could not download document ${document.id}: ${error?.message || 'empty file'}`);
      archive.append(Buffer.from(await data.arrayBuffer()), {
        name: sanitizeFileName(document.fileName)
      });
    }
    await archive.finalize();
  } catch (error) {
    next(error);
  }
});

app.get('/api/cache/status', (_request, response) => {
  response.json({ ok: true, entries: 0, hits: 0, misses: 0, mode: 'SUPABASE_STORAGE' });
});

app.get('/api/database/files-manifest', (_request, response) => {
  response.json({ ok: true, files: [] });
});

app.get('/api/network/config', (_request, response) => {
  response.json({
    ok: true,
    domainName: '',
    port: 443,
    lanIps: [],
    readOnly: true
  });
});

app.get('/api/install/status', async (_request, response) => {
  try {
    const { data, error } = await getSupabase()
      .from('app_state_store')
      .select('id')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    response.json({ ok: true, installed: Boolean(data), database: 'Supabase' });
  } catch (error) {
    response.status(503).json({
      ok: false,
      installed: false,
      error: error instanceof Error ? error.message : 'Supabase is unavailable.'
    });
  }
});

app.get('/api/update/history', (_request, response) => {
  response.json({ ok: true, history: [], updatesAvailable: false });
});

app.all('/api/*', (_request, response) => {
  response.status(404).json({ ok: false, error: 'This API endpoint is not available in cloud mode.' });
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const explicitStatus =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : undefined;
  const errorCode = getErrorCode(error);
  const availabilityFailure =
    errorCode === '57014' ||
    errorCode === '53300' ||
    errorCode === '57P01' ||
    Boolean(errorCode?.startsWith('08')) ||
    error instanceof TypeError;
  const status = explicitStatus ?? (availabilityFailure ? 503 : 500);
  if (status >= 500) console.error('Cloud API request failed:', error);
  response.status(Number.isInteger(status) && status >= 400 && status < 600 ? status : 500).json({
    ok: false,
    error: error instanceof Error ? error.message : 'Cloud API request failed.'
  });
});

export default app;
export { app };
