# Spec: Public GitHub Diff Ingestion (No Auth)

## Goals
- Select public repo, branch, and commit or commit range.
- Fetch diffs and integrate with existing diff viewer and diagrams.
- Avoid GitHub auth; handle unauthenticated rate limits.

## API Endpoints (REST v3)
- List branches: `GET /repos/{owner}/{repo}/branches?per_page=100`
- List commits for branch: `GET /repos/{owner}/{repo}/commits?sha={branch}&per_page=100`
- Compare range: `GET /repos/{owner}/{repo}/compare/{base}...{head}`
- Fetch raw file (if needed): `GET https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}`

## Data Flow
1) UI collects `owner/repo`, branch, base/head SHAs or single commit.
2) Adapter calls `compare` (or single commit diff via compare with parent).
3) Normalize to internal `Diff` model and pass to `diff-parser`.
4) Cache responses; update UI state.

## Adapter Design
- New module: `src/lib/github-adapter.ts` (I/O only).
- Expose functions: `listBranches`, `listCommits`, `compare(base, head)`.
- Parse minimal subset to feed current pipeline; keep raw payload for debugging.
- Configurable `User-Agent`, ETag caching, and retry/backoff.

## Rate Limits
- Unauth limit: ~60 requests/hour/IP. Mitigations:
  - Cache by repo/branch/SHA in-memory and IndexedDB.
  - Batch requests; prefer `compare` over many per-file calls.
  - Optional user-supplied token later (not now).

## UI Additions
- Repo input: `owner/repo` text field with validation.
- Branch dropdown (from branches endpoint).
- Commit/range picker with search + recent list.
- Source selector: Local (current) | GitHub (new).

## Errors & States
- Empty repo or range -> friendly message.
- Rate limited -> retry after header; show countdown.
- Network errors -> retry/backoff with offline cache if available.

## Testing
- Record fixtures for `branches`, `commits`, `compare`.
- Unit tests for adapter normalization.
- Integration: load range and ensure diffs render identically to local upload.

## Cache (Final Plan)
- Keying: Stable keys per resource and params, namespaced with a version to avoid schema collisions.
  - Examples:
    - Compare range: `github:v1|compare|owner/repo|<baseSha>...<headSha>`
    - Single commit (alias): `github:v1|commit-diff|owner/repo|<commitSha>` → internally stores as parent...commit
    - Raw file: `github:v1|raw|owner/repo|<refOrSha>|<path>`
    - Branch list: `github:v1|branches|owner/repo`
    - Commits on branch: `github:v1|commits|owner/repo|<branch>`
- Tiers:
  - In-memory LRU (fast, process-lifetime, e.g., max 100 entries)
  - IndexedDB persistent store (survives reloads; prunes LRU when over soft cap)
- Single policy: prefer-cache-revalidate (no other policies for v1)
  - Use cached value immediately when present
  - Fire conditional request with ETag/Last-Modified
  - On 304, keep cache; on 200, update cache and return fresh
  - Immutable keys (SHA-based compare, raw-by-SHA) can skip the network revalidate step if desired
- Staleness:
  - Immutable resources: effectively long TTL; treat as stable once stored
  - Mutable resources (branches, commits on branch): short TTL (e.g., 2–5 minutes) stored in entry; revalidate when TTL expired
- Rate-limit aware:
  - Track `x-ratelimit-remaining`/`x-ratelimit-reset` from last responses
  - If near zero, prefer cached values even if TTL expired for non-critical refreshes
- Entry structure (no compression flag):
```ts
export type GithubResource = 'branches' | 'commits' | 'compare' | 'raw';

export type CacheKey = {
  namespace: string;         // e.g., 'github:v1'
  resource: GithubResource;
  owner: string;
  repo: string;
  branch?: string;
  sha?: string;              // for commit alias
  base?: string;             // base SHA
  head?: string;             // head SHA
  ref?: string;              // for raw
  path?: string;             // for raw
};

export type CacheEntry<T> = {
  data: T;
  meta: {
    etag?: string;
    lastModified?: string;
    createdAt: number;       // ms epoch
    ttlMs?: number;          // only for mutable resources
    url?: string;
    params?: Record<string, string>;
    schemaVersion: string;   // e.g., 'v1'
    sizeBytes?: number;
  };
};

export interface RepoCache {
  get<T>(key: CacheKey): Promise<CacheEntry<T> | null>;
  set<T>(key: CacheKey, entry: CacheEntry<T>): Promise<void>;
  has(key: CacheKey): Promise<boolean>;
  invalidate(key: CacheKey): Promise<void>;
  clearNamespace(namespace: string): Promise<void>;
}
```
- Client surface (no policy parameter; always prefer-cache-revalidate):
```ts
export interface GithubClient {
  listBranches(args: { owner: string; repo: string; per_page?: number }): Promise<
    { branches: Array<{ name: string; commitSha: string }>; fromCache: boolean }
  >;

  listCommits(args: { owner: string; repo: string; sha: string; per_page?: number }): Promise<
    { commits: Array<{ sha: string; message: string; author?: string }>; fromCache: boolean }
  >;

  compare(args: { owner: string; repo: string; base: string; head: string }): Promise<
    { diff: YourNormalizedDiff; fromCache: boolean }
  >;

  getRaw(args: { owner: string; repo: string; ref: string; path: string }): Promise<
    { content: string; fromCache: boolean }
  >;
}
```
- Storage behavior for diffs:
  - Single commit: store as one immutable compare entry keyed by `parentSha...commitSha` (client may resolve parent once)
  - Range: store the entire range as one immutable compare entry keyed by `<baseSha>...<headSha>`
  - Optional future optimization: add a lightweight per-file index, but v1 uses single-entry storage for simplicity
