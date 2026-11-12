export type OfflineConflictResolution = 'LOCAL' | 'SERVER';

export interface OfflineConflict {
  key: string;
  collection: string;
  recordId: string;
  localValue: unknown;
  serverValue: unknown;
  localTimestamp: string | null;
  serverTimestamp: string | null;
}

export interface PendingOfflineSnapshot<T> {
  id: 'pending-snapshot';
  clientId?: string;
  commitId?: string;
  actorUsername?: string;
  baseSnapshot: T;
  snapshot: T;
  baseRevision: string | null;
  startedAt: string;
  updatedAt: string;
  changedAt: Record<string, string>;
}

export function shouldQueueOfflineChanges(
  browserOnline: boolean,
  status: number | null,
  error?: unknown
): boolean {
  if (!browserOnline) return true;
  if (status !== null) return [408, 502, 503, 504].includes(status);
  return error instanceof TypeError;
}

export function omitActiveSessionArchive<
  T extends {
    sessions?: Array<{ id: number; isCurrent?: boolean }>;
    sessionArchives?: Array<{ sessionId: number }>;
  }
>(snapshot: T): T {
  const activeSession = snapshot.sessions?.find(session => session.isCurrent);
  if (!activeSession || !snapshot.sessionArchives) return snapshot;
  const sessionArchives = snapshot.sessionArchives.filter(
    archive => archive.sessionId !== activeSession.id
  );
  if (sessionArchives.length === snapshot.sessionArchives.length) return snapshot;
  return Object.assign({}, snapshot, { sessionArchives });
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`Server returned an empty response (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown content type';
    throw new Error(
      `Server returned a non-JSON response (HTTP ${response.status}, ${contentType}). The request may have reached a web page instead of the application API.`
    );
  }
}

export async function encodeJsonRequestBody(value: unknown): Promise<string> {
  const json = JSON.stringify(value);
  if (typeof CompressionStream === 'undefined') return json;

  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  if (bytes.length >= new TextEncoder().encode(json).length) return json;

  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return JSON.stringify({ __edugrade_gzip_base64: btoa(binary) });
}

export async function fetchOfflineCommitWithRetry(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
  attempts = 3
): Promise<Response> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(url, init);
      if (![502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
    } catch (error) {
      if (attempt === attempts - 1) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error('Offline commit request could not be completed.');
}

export interface PendingOfflineDocument<T> {
  id: string;
  action?: 'UPLOAD' | 'DELETE';
  fileName: string;
  mimeType?: string;
  file?: Blob;
  metadata?: T;
}

const DATABASE_NAME = 'edugrade-offline-outbox-v1';
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const DOCUMENT_STORE = 'documents';

function openOutboxDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not support durable offline storage.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
        database.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
    request.onblocked = () => reject(new Error('Offline storage is blocked by another open application tab.'));
  });
}

function useStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openOutboxDatabase().then(database => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline storage operation failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline storage transaction was aborted.'));
    transaction.oncomplete = () => database.close();
  }));
}

export function loadPendingOfflineSnapshot<T>(): Promise<PendingOfflineSnapshot<T> | undefined> {
  return useStore<PendingOfflineSnapshot<T> | undefined>(
    SNAPSHOT_STORE,
    'readonly',
    store => store.get('pending-snapshot')
  );
}

export function savePendingOfflineSnapshot<T>(queue: PendingOfflineSnapshot<T>): Promise<IDBValidKey> {
  return useStore<IDBValidKey>(SNAPSHOT_STORE, 'readwrite', store => store.put(queue));
}

export async function clearPendingOfflineSnapshot(): Promise<void> {
  await useStore<undefined>(
    SNAPSHOT_STORE,
    'readwrite',
    store => store.delete('pending-snapshot')
  );
}

export async function clearPendingOfflineSnapshotIfMatches(commitId: string): Promise<boolean> {
  const database = await openOutboxDatabase();
  return new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite');
    const store = transaction.objectStore(SNAPSHOT_STORE);
    let cleared = false;
    const request = store.get('pending-snapshot');
    request.onsuccess = () => {
      if (request.result?.commitId === commitId) {
        store.delete('pending-snapshot');
        cleared = true;
      }
    };
    request.onerror = () => reject(request.error || new Error('Could not inspect pending offline changes.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline storage transaction was aborted.'));
    transaction.oncomplete = () => {
      database.close();
      resolve(cleared);
    };
  });
}

export async function clearPendingOfflineData(): Promise<void> {
  await Promise.all([
    useStore<undefined>(SNAPSHOT_STORE, 'readwrite', store => store.clear()),
    useStore<undefined>(DOCUMENT_STORE, 'readwrite', store => store.clear())
  ]);
}

export function savePendingOfflineDocument<T>(document: PendingOfflineDocument<T>): Promise<IDBValidKey> {
  return useStore<IDBValidKey>(DOCUMENT_STORE, 'readwrite', store => store.put(document));
}

export function removePendingOfflineDocument(id: string): Promise<undefined> {
  return useStore<undefined>(DOCUMENT_STORE, 'readwrite', store => store.delete(id));
}

export function loadPendingOfflineDocuments<T>(): Promise<PendingOfflineDocument<T>[]> {
  return useStore<PendingOfflineDocument<T>[]>(DOCUMENT_STORE, 'readonly', store => store.getAll());
}

export interface OfflineConflictMergeResult<T> {
  snapshot: T | null;
  conflicts: OfflineConflict[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${serialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function isEqual(left: unknown, right: unknown): boolean {
  return serialize(left) === serialize(right);
}

function recordKey(value: unknown, index: number): string {
  if (isRecord(value)) {
    const key = value.id ?? value.studentId ?? value.name;
    if (key !== undefined && key !== null) return String(key);
  }
  return `index-${index}`;
}

function timestampFromRecord(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const timestamp = value.updatedAt || value.uploadedAt || value.createdAt || value.updated_at;
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) return null;
  return timestamp;
}

function compareTimestamp(left: string | null, right: string | null): number | null {
  if (!left || !right) return null;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs) || leftMs === rightMs) return null;
  return leftMs > rightMs ? 1 : -1;
}

export function createPendingOfflineSnapshot<T>(
  baseSnapshot: T,
  snapshot: T,
  baseRevision: string | null,
  now: string,
  previous?: PendingOfflineSnapshot<T>
): PendingOfflineSnapshot<T> {
  const base = (previous?.baseSnapshot || baseSnapshot) as Record<string, unknown>;
  const current = snapshot as Record<string, unknown>;
  const changedAt = { ...(previous?.changedAt || {}) };

  for (const collection of Object.keys(current)) {
    const baseValue = base[collection];
    const localValue = current[collection];
    if (Array.isArray(baseValue) && Array.isArray(localValue)) {
      const baseMap = new Map(baseValue.map((item, index) => [recordKey(item, index), item]));
      const localMap = new Map(localValue.map((item, index) => [recordKey(item, index), item]));
      for (const key of new Set([...baseMap.keys(), ...localMap.keys()])) {
        const changeKey = `${collection}:${key}`;
        if (isEqual(baseMap.get(key), localMap.get(key))) {
          delete changedAt[changeKey];
        } else {
          changedAt[changeKey] = now;
        }
      }
    } else if (!isEqual(baseValue, localValue)) {
      changedAt[collection] = now;
    } else {
      delete changedAt[collection];
    }
  }

  return {
    id: 'pending-snapshot',
    baseSnapshot: previous?.baseSnapshot || baseSnapshot,
    snapshot,
    baseRevision: previous?.baseRevision ?? baseRevision,
    startedAt: previous?.startedAt || now,
    updatedAt: now,
    changedAt
  };
}

export function mergePendingOfflineSnapshot<T>(
  serverSnapshot: T,
  queue: PendingOfflineSnapshot<T>,
  serverRevision: string | null,
  resolutions: Record<string, OfflineConflictResolution> = {}
): OfflineConflictMergeResult<T> {
  const base = queue.baseSnapshot as Record<string, unknown>;
  const local = queue.snapshot as Record<string, unknown>;
  const server = serverSnapshot as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...server };
  const conflicts: OfflineConflict[] = [];

  for (const collection of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(server)])) {
    const baseValue = base[collection];
    const localValue = local[collection];
    const serverValue = server[collection];

    if (Array.isArray(baseValue) && Array.isArray(localValue) && Array.isArray(serverValue)) {
      const baseMap = new Map(baseValue.map((item, index) => [recordKey(item, index), item]));
      const localMap = new Map(localValue.map((item, index) => [recordKey(item, index), item]));
      const serverMap = new Map(serverValue.map((item, index) => [recordKey(item, index), item]));
      const result = new Map(serverMap);

      for (const key of new Set([...baseMap.keys(), ...localMap.keys()])) {
        const baseItem = baseMap.get(key);
        const localItem = localMap.get(key);
        if (isEqual(baseItem, localItem)) continue;

        const serverItem = serverMap.get(key);
        const changedKey = `${collection}:${key}`;
        if (isEqual(baseItem, serverItem)) {
          if (localItem === undefined) result.delete(key);
          else result.set(key, localItem);
          continue;
        }

        const localTimestamp =
          timestampFromRecord(localItem) || queue.changedAt[changedKey] || queue.updatedAt;
        const serverTimestamp = timestampFromRecord(serverItem) || serverRevision;
        const newer = compareTimestamp(localTimestamp, serverTimestamp);
        const resolution = resolutions[changedKey];
        if (resolution === 'LOCAL' || (resolution !== 'SERVER' && newer === 1)) {
          if (localItem === undefined) result.delete(key);
          else result.set(key, localItem);
        } else if (resolution === 'SERVER' || newer === -1) {
          continue;
        } else {
          conflicts.push({
            key: changedKey,
            collection,
            recordId: key,
            localValue: localItem,
            serverValue: serverItem,
            localTimestamp,
            serverTimestamp
          });
        }
      }

      merged[collection] = Array.from(result.values());
      continue;
    }

    if (isEqual(baseValue, localValue)) continue;
    if (isEqual(baseValue, serverValue)) {
      merged[collection] = localValue;
      continue;
    }

    const resolution = resolutions[collection];
    if (resolution === 'LOCAL') {
      merged[collection] = localValue;
    } else if (resolution !== 'SERVER') {
      conflicts.push({
        key: collection,
        collection,
        recordId: collection,
        localValue,
        serverValue,
        localTimestamp: queue.changedAt[collection] || queue.updatedAt,
        serverTimestamp: serverRevision
      });
    }
  }

  return {
    snapshot: conflicts.length > 0 ? null : merged as unknown as T,
    conflicts
  };
}
