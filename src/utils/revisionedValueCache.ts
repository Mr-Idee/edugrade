export class RevisionedValueCache<T> {
  private entry: { revision: string; value: T; expiresAtMs: number } | null = null;

  constructor(private readonly ttlMs: number) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error('Cache TTL must be a positive finite number.');
    }
  }

  get(revision: string, nowMs = Date.now()): T | null {
    if (!this.entry) return null;
    if (nowMs >= this.entry.expiresAtMs || this.entry.revision !== revision) {
      this.entry = null;
      return null;
    }
    return this.entry.value;
  }

  set(revision: string, value: T, nowMs = Date.now()): void {
    this.entry = { revision, value, expiresAtMs: nowMs + this.ttlMs };
  }

  clear(): void {
    this.entry = null;
  }
}
