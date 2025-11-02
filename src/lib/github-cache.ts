import type { CacheEntry, CacheKey, RepoCache } from "@types";

// Utilities for cache key serialization and staleness checks

export function serializeKey(key: CacheKey): string {
  const base = `${key.namespace}|${key.resource}|${key.owner}/${key.repo}`;
  switch (key.resource) {
    case "compare": {
      const baseSha = key.base ?? "";
      const headSha = key.head ?? "";
      return `${base}|${baseSha}...${headSha}`;
    }
    case "commits": {
      return `${base}|${key.branch ?? ""}`;
    }
    case "raw": {
      return `${base}|${key.ref ?? ""}|${key.path ?? ""}`;
    }
    case "branches":
    default:
      return base;
  }
}

export function deserializeKey(keyStr: string): CacheKey | null {
  // Best-effort reverse of serializeKey; used primarily for debugging and scans
  const [namespace, resource, ownerRepo, restA, restB] = keyStr.split("|");
  if (!namespace || !resource || !ownerRepo) {
    return null;
  }
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) {
    return null;
  }

  if (resource === "compare") {
    const [base, head] = (restA || "").split("...");
    return {
      namespace,
      resource: "compare",
      owner,
      repo,
      base,
      head,
    } as CacheKey;
  }
  if (resource === "commits") {
    return {
      namespace,
      resource: "commits",
      owner,
      repo,
      branch: restA,
    } as CacheKey;
  }
  if (resource === "raw") {
    return {
      namespace,
      resource: "raw",
      owner,
      repo,
      ref: restA,
      path: restB,
    } as CacheKey;
  }
  return { namespace, resource: "branches", owner, repo } as CacheKey;
}

export function isStale<T>(
  entry: CacheEntry<T> | null,
  nowMs: number = Date.now(),
): boolean {
  if (!entry) {
    return true;
  }
  if (entry.meta.ttlMs === null || entry.meta.ttlMs === undefined) {
    return false;
  } // immutable entries
  return nowMs - entry.meta.createdAt > entry.meta.ttlMs;
}

// In-memory LRU cache for fast access
class MemoryLru {
  private map = new Map<string, CacheEntry<unknown>>();
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
  }

  get<T>(key: string): CacheEntry<T> | null {
    const value = this.map.get(key) as CacheEntry<T> | undefined;
    if (value) {
      // refresh LRU
      this.map.delete(key);
      this.map.set(key, value);
      return value;
    }
    return null;
  }

  set<T>(key: string, value: CacheEntry<T>): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const firstKey = this.map.keys().next().value as string | undefined;
      if (firstKey) {
        this.map.delete(firstKey);
      }
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

// IndexedDB wrapper for persistence
class IdxStore {
  private readonly dbName = "githubCacheDb";
  private readonly storeName = "entries";
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async open(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }
    if (!("indexedDB" in window)) {
      // Fallback: reject to signal unavailability
      return Promise.reject(new Error("IndexedDB not available"));
    }
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, {
            keyPath: "key",
          });
          store.createIndex("namespace", "namespace");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const db = await this.open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const req = store.get(key);
        req.onsuccess = () =>
          resolve((req.result?.value as CacheEntry<T>) ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async set<T>(
    key: string,
    value: CacheEntry<T>,
    namespace: string,
  ): Promise<void> {
    try {
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const req = store.put({ key, namespace, value });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // ignore persistence failure
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // ignore
    }
  }

  async clearNamespace(namespace: string): Promise<void> {
    try {
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const idx = store.index("namespace");
        const req = idx.openKeyCursor(IDBKeyRange.only(namespace));
        req.onsuccess = () => {
          const cursor = req.result as IDBCursor | null;
          if (cursor) {
            store.delete(cursor.primaryKey as IDBValidKey);
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      // ignore
    }
  }
}

export class GithubRepoCache implements RepoCache {
  private readonly memory: MemoryLru;
  private readonly persistent: IdxStore;

  constructor(capacity = 100) {
    this.memory = new MemoryLru(capacity);
    this.persistent = new IdxStore();
  }

  async get<T>(key: CacheKey): Promise<CacheEntry<T> | null> {
    const k = serializeKey(key);
    const fromMem = this.memory.get<T>(k);
    if (fromMem) {
      return fromMem;
    }
    const fromDb = await this.persistent.get<T>(k);
    if (fromDb) {
      this.memory.set(k, fromDb);
    }
    return fromDb;
  }

  async set<T>(key: CacheKey, entry: CacheEntry<T>): Promise<void> {
    const k = serializeKey(key);
    this.memory.set(k, entry);
    await this.persistent.set(k, entry, key.namespace);
  }

  async has(key: CacheKey): Promise<boolean> {
    const k = serializeKey(key);
    if (this.memory.has(k)) {
      return true;
    }
    const existing = await this.persistent.get(k);
    return existing !== null && existing !== undefined;
  }

  async invalidate(key: CacheKey): Promise<void> {
    const k = serializeKey(key);
    this.memory.delete(k);
    await this.persistent.delete(k);
  }

  async clearNamespace(namespace: string): Promise<void> {
    // Clear memory entries for this namespace
    // Simple approach: rebuild map excluding namespace keys
    // Note: MemoryLru does not expose iteration; do a full reset for simplicity
    this.memory.clear();
    await this.persistent.clearNamespace(namespace);
  }
}
