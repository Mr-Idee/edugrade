interface DocumentCacheEntry {
  bytes: Uint8Array;
  expiresAtMs: number;
}

export interface DocumentBytesCacheStats {
  entries: number;
  cachedBytes: number;
  hits: number;
  misses: number;
  bytesServedFromCache: number;
}

export class DocumentBytesCache {
  private readonly entries = new Map<string, DocumentCacheEntry>();
  private cachedBytes = 0;
  private hits = 0;
  private misses = 0;
  private bytesServedFromCache = 0;

  constructor(
    private readonly options: {
      maxBytes: number;
      maxEntryBytes: number;
      ttlMs: number;
    }
  ) {
    if (
      !Number.isSafeInteger(options.maxBytes) ||
      !Number.isSafeInteger(options.maxEntryBytes) ||
      !Number.isSafeInteger(options.ttlMs) ||
      options.maxBytes <= 0 ||
      options.maxEntryBytes <= 0 ||
      options.maxEntryBytes > options.maxBytes ||
      options.ttlMs <= 0
    ) {
      throw new Error('Document cache limits must be positive safe integers.');
    }
  }

  get(key: string, nowMs = Date.now()): Uint8Array | null {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (nowMs >= entry.expiresAtMs) {
      this.remove(key, entry);
      this.misses += 1;
      return null;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits += 1;
    this.bytesServedFromCache += entry.bytes.byteLength;
    return entry.bytes;
  }

  set(key: string, bytes: Uint8Array, nowMs = Date.now()): void {
    if (bytes.byteLength > this.options.maxEntryBytes) return;

    const existing = this.entries.get(key);
    if (existing) this.remove(key, existing);

    while (this.cachedBytes + bytes.byteLength > this.options.maxBytes) {
      const oldest = this.entries.entries().next().value as
        | [string, DocumentCacheEntry]
        | undefined;
      if (!oldest) break;
      this.remove(oldest[0], oldest[1]);
    }

    const entry = {
      bytes: Uint8Array.from(bytes),
      expiresAtMs: nowMs + this.options.ttlMs
    };
    this.entries.set(key, entry);
    this.cachedBytes += entry.bytes.byteLength;
  }

  delete(key: string): void {
    const entry = this.entries.get(key);
    if (entry) this.remove(key, entry);
  }

  getStats(nowMs = Date.now()): DocumentBytesCacheStats {
    for (const [key, entry] of this.entries) {
      if (nowMs >= entry.expiresAtMs) this.remove(key, entry);
    }

    return {
      entries: this.entries.size,
      cachedBytes: this.cachedBytes,
      hits: this.hits,
      misses: this.misses,
      bytesServedFromCache: this.bytesServedFromCache
    };
  }

  private remove(key: string, entry: DocumentCacheEntry): void {
    this.entries.delete(key);
    this.cachedBytes -= entry.bytes.byteLength;
  }
}
