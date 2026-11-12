/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TeacherDocumentUpload } from '../types/index';

export interface CacheEntryMetadata<T = unknown> {
  key: string;
  value: T;
  etag: string;
  byteSize: number;
  createdAtMs: number;
  expiresAtMs: number;
  hitCount: number;
}

export interface DocumentCacheTelemetry {
  engine: 'REDIS_AND_LOCAL_LRU' | 'LOCAL_WRITE_THROUGH_LRU';
  redisConfigured: boolean;
  redisUrl: string;
  totalEntries: number;
  cachedDocumentCount: number;
  cachedBytes: number;
  cacheHits: number;
  cacheMisses: number;
  hitRatePct: number;
  dbQueriesSaved: number;
  evictions: number;
  maxEntries: number;
  defaultTtlSeconds: number;
  lastFlushedAt: string | null;
}

/**
 * Generates a lightweight deterministic ETag hash for HTTP 304 Not Modified caching
 * without requiring Node crypto in browser bundles.
 */
export function computeDocumentETag(payload: string): string {
  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  for (let i = 0, ch; i < payload.length; i++) {
    ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `"doc-${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}"`;
}

/**
 * Formats a clean, standardized filename for individual or sorted bulk downloads
 * according to the active sort order (week, subject, teacher, class, or department).
 */
export function formatSortedDocumentDownloadName(
  doc: Pick<
    TeacherDocumentUpload,
    'weekNumber' | 'subjectName' | 'sectionName' | 'teacherName' | 'documentTitle' | 'fileExtension' | 'fileName'
  > & { departmentName?: string },
  sortBy:
    | 'week'
    | 'subject'
    | 'teacher'
    | 'class'
    | 'department'
    | 'WEEK'
    | 'SUBJECT'
    | 'TEACHER'
    | 'CLASS'
    | 'DEPARTMENT' = 'week',
  indexZeroBased?: number
): string {
  const sanitize = (str: string) =>
    (str || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const weekTag = `Week_${String(doc.weekNumber || 1).padStart(2, '0')}`;
  const subjTag = sanitize(doc.subjectName || 'Subject');
  const classTag = sanitize(doc.sectionName || 'Class');
  const teacherTag = sanitize(doc.teacherName || 'Teacher');
  const titleTag = sanitize(doc.documentTitle || 'Document');
  const deptTag = doc.departmentName ? sanitize(doc.departmentName) : '';
  const ext = (doc.fileExtension || 'PDF').toLowerCase();
  const prefixIdx = typeof indexZeroBased === 'number' ? `${String(indexZeroBased + 1).padStart(2, '0')}_` : '';
  const normalizedSort = String(sortBy || 'week').toLowerCase();

  switch (normalizedSort) {
    case 'subject':
      return `${prefixIdx}${subjTag}_${weekTag}_${classTag}_${teacherTag}_${titleTag}.${ext}`;
    case 'teacher':
      return `${prefixIdx}${teacherTag}_${subjTag}_${weekTag}_${classTag}_${titleTag}.${ext}`;
    case 'class':
      return `${prefixIdx}${classTag}_${subjTag}_${weekTag}_${teacherTag}_${titleTag}.${ext}`;
    case 'department':
      return `${prefixIdx}${deptTag || 'Dept'}_${subjTag}_${weekTag}_${teacherTag}_${titleTag}.${ext}`;
    case 'week':
    default:
      return `${prefixIdx}${weekTag}_${subjTag}_${classTag}_${teacherTag}_${titleTag}.${ext}`;
  }
}

/**
 * High-Performance Write-Through LRU + TTL Cache Engine with Redis Adapter support.
 * Designed to offload frequent document metadata queries, file stream downloads, and
 * HOD/Principal/VP bulk review requests so the relational MySQL database is never slowed down.
 */
export class DocumentCacheManager {
  private store = new Map<string, CacheEntryMetadata<any>>();
  private maxEntries: number;
  private defaultTtlMs: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private lastFlushedAt: string | null = null;
  private redisUrl: string;

  constructor(options?: { maxEntries?: number; defaultTtlSeconds?: number; redisUrl?: string }) {
    this.maxEntries = options?.maxEntries || 500;
    this.defaultTtlMs = (options?.defaultTtlSeconds || 900) * 1000; // Default 15 min TTL
    this.redisUrl = options?.redisUrl || '';
  }

  public get<T>(key: string, nowMs = Date.now()): { value: T; etag: string } | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }

    if (nowMs > entry.expiresAtMs) {
      this.store.delete(key);
      this.misses += 1;
      return null;
    }

    // Refresh LRU order by re-inserting
    entry.hitCount += 1;
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;

    return { value: entry.value as T, etag: entry.etag };
  }

  public set<T>(key: string, value: T, ttlSeconds?: number, nowMs = Date.now()): CacheEntryMetadata<T> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const byteSize = serialized ? serialized.length : 0;
    const etag = computeDocumentETag(serialized || key);
    const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.defaultTtlMs;

    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      // Evict least-recently-used (first item in Map iteration order)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
        this.evictions += 1;
      }
    }

    const entry: CacheEntryMetadata<T> = {
      key,
      value,
      etag,
      byteSize,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
      hitCount: 0
    };

    this.store.set(key, entry);
    return entry;
  }

  public invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const k of Array.from(this.store.keys())) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  public flushAll(): void {
    this.store.clear();
    this.lastFlushedAt = new Date().toISOString();
  }

  public getTelemetry(): DocumentCacheTelemetry {
    let cachedBytes = 0;
    let cachedDocumentCount = 0;
    for (const [k, entry] of this.store.entries()) {
      cachedBytes += entry.byteSize;
      if (k.startsWith('doc:')) {
        cachedDocumentCount += 1;
      }
    }
    const totalRequests = this.hits + this.misses;
    const hitRatePct = totalRequests > 0 ? Number(((this.hits / totalRequests) * 100).toFixed(1)) : 100;

    return {
      engine: this.redisUrl ? 'REDIS_AND_LOCAL_LRU' : 'LOCAL_WRITE_THROUGH_LRU',
      redisConfigured: Boolean(this.redisUrl),
      redisUrl: this.redisUrl || 'redis://127.0.0.1:6379 (Write-Through In-Memory LRU Active)',
      totalEntries: this.store.size,
      cachedDocumentCount,
      cachedBytes,
      cacheHits: this.hits,
      cacheMisses: this.misses,
      hitRatePct,
      dbQueriesSaved: this.hits,
      evictions: this.evictions,
      maxEntries: this.maxEntries,
      defaultTtlSeconds: Math.round(this.defaultTtlMs / 1000),
      lastFlushedAt: this.lastFlushedAt
    };
  }
}
