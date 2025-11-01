<!-- 89284e07-43bf-4c87-baa9-b72108fa1853 921cd220-a86f-4482-bd7d-1d9753f5946c -->
# GitHub Diff Ingestion Implementation

## Overview

Enable users to fetch diffs from public GitHub repositories without authentication, with robust caching and rate limit handling. Integrates seamlessly with existing `diff-parser.ts` and diagram rendering pipeline.

## 1. Type Definitions (`src/types/github.ts`)

Create comprehensive types for GitHub API responses, cache system, and client interface:

```typescript
// GitHub API response types
export interface GithubBranch {
  name: string;
  commit: { sha: string };
}

export interface GithubCommit {
  sha: string;
  commit: {
    message: string;
    author?: { name: string; date: string };
  };
}

export interface GithubCompareResponse {
  files: Array<{
    filename: string;
    status: string;
    patch?: string;
    additions: number;
    deletions: number;
  }>;
}

// Cache system types (from spec lines 72-108)
export type GithubResource = 'branches' | 'commits' | 'compare' | 'raw';

export interface CacheKey {
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
}

export interface CacheEntry<T> {
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
}

export interface RepoCache {
  get<T>(key: CacheKey): Promise<CacheEntry<T> | null>;
  set<T>(key: CacheKey, entry: CacheEntry<T>): Promise<void>;
  has(key: CacheKey): Promise<boolean>;
  invalidate(key: CacheKey): Promise<void>;
  clearNamespace(namespace: string): Promise<void>;
}

// Client interface (from spec lines 110-128)
export interface GithubClient {
  listBranches(args: { owner: string; repo: string; per_page?: number }): Promise<
    { branches: Array<{ name: string; commitSha: string }>; fromCache: boolean }
  >;

  listCommits(args: { owner: string; repo: string; sha: string; per_page?: number }): Promise<
    { commits: Array<{ sha: string; message: string; author?: string }>; fromCache: boolean }
  >;

  compare(args: { owner: string; repo: string; base: string; head: string }): Promise<
    { diff: string; fromCache: boolean }  // diff is unified diff format string
  >;

  getRaw(args: { owner: string; repo: string; ref: string; path: string }): Promise<
    { content: string; fromCache: boolean }
  >;
}

export interface RateLimitInfo {
  remaining: number;
  reset: number;  // epoch timestamp
  limit: number;
}
```

## 2. Cache Implementation (`src/lib/github-cache.ts`)

Implement two-tier caching (in-memory LRU + IndexedDB) with prefer-cache-revalidate strategy:

**Key Features:**

- Stable cache keys with versioned namespace (`github:v1`)
- In-memory LRU (max 100 entries) for fast access
- IndexedDB for persistence across sessions
- TTL handling: immutable resources (SHA-based) have long TTL; mutable resources (branches, commits) have 2-5 min TTL
- Rate-limit aware: prefer cached values when rate limit low
- ETag/Last-Modified support for conditional requests

**Implementation:**

- `serializeKey(key: CacheKey): string` - Convert structured key to stable string format per spec lines 51-54
- `deserializeKey(str: string): CacheKey` - Parse key from string
- `isStale(entry: CacheEntry<any>): boolean` - Check if TTL expired
- In-memory Map with LRU eviction
- IndexedDB wrapper with async operations

## 3. GitHub Adapter (`src/lib/github-adapter.ts`)

Core I/O module for GitHub API communication:

**Responsibilities:**

- Construct API URLs for REST v3 endpoints
- Handle unauthenticated requests with `User-Agent` header
- Parse GitHub API responses to normalized format
- Integrate with cache layer (always use prefer-cache-revalidate)
- Track rate limit headers (`x-ratelimit-remaining`, `x-ratelimit-reset`)
- Implement retry/backoff on 429 or network errors
- Convert GitHub compare response to unified diff format for `parseDiff()`

**Key Functions:**

- `listBranches({ owner, repo, per_page })` → normalized branch list
- `listCommits({ owner, repo, sha, per_page })` → normalized commit list
- `compare({ owner, repo, base, head })` → unified diff string
- `getRaw({ owner, repo, ref, path })` → file content string

**Implementation Notes:**

- Use `fetch()` with conditional headers (If-None-Match, If-Modified-Since)
- On 304: return cached data with `fromCache: true`
- On 200: update cache, return fresh data with `fromCache: false`
- Parse minimal subset needed for UI; keep raw payload for debugging
- Convert GitHub's patch format to unified diff format compatible with existing `parseDiff()`

## 4. UI Components

### Source Selector (`src/components/source-selector.ts`)

Toggle between "Local Upload" and "GitHub" modes. Updates main UI to show/hide appropriate input sections.

### GitHub Repo Input (`src/components/github-inputs.ts`)

- Text field for `owner/repo` with validation (format check)
- Branch dropdown populated by `listBranches()`
- Commit picker with:
  - Search/filter for commit SHAs and messages
  - Recent commits list from `listCommits()`
  - Base/Head commit selection for ranges
  - Option for single commit diff (resolves parent automatically)
- "Fetch Diff" button to trigger comparison

**Validation:**

- Check repo format matches `owner/repo` pattern
- Display loading states during API calls
- Show error messages for invalid repos or network issues

### Error States (`src/components/error-display.ts`)

- Empty repo/range: "No commits found in range"
- Rate limited: Show countdown with retry-after header
- Network errors: Retry with backoff, use cached data if available
- Invalid repo: "Repository not found or not public"

## 5. Integration with Existing Pipeline

Update `src/main.ts` (`CodeReviewApp` class):

- Add source selector component
- Branch on source type:
  - **Local**: Use existing `FileUploader` → `parseDiff()` flow
  - **GitHub**: Use `GithubClient.compare()` → `parseDiff()` flow
- Both paths converge at `parseDiff()` with unified diff string
- Existing diagram and diff viewer work unchanged

**Refactor `handleFileLoad()` to `handleDiffLoad()`:**

```typescript
private async handleDiffLoad(content: string, source: 'local' | 'github'): Promise<void> {
  // Existing logic remains the same - parseDiff, extractFunctions, generateMermaidDiagram
  // Just rename to reflect it can come from multiple sources
}
```

## 6. Error Handling & States

- **Loading states:** Show spinners during API calls
- **Empty states:** Display helpful messages when no diffs found
- **Rate limit handling:** 
  - Monitor `x-ratelimit-remaining` header
  - Show countdown when limited
  - Prefer cache when approaching limit
- **Network errors:** Exponential backoff with max 3 retries
- **Offline mode:** Use cached data when available, show indicator

## 7. Testing Strategy

Create test fixtures in `tests/fixtures/github/`:

- `branches.json` - Sample branch list response
- `commits.json` - Sample commit list response  
- `compare.json` - Sample compare API response
- `unified-diff.txt` - Expected unified diff output

**Unit tests:**

- `github-cache.test.ts` - Cache key serialization, TTL, eviction
- `github-adapter.test.ts` - API normalization, retry logic, diff conversion
- Test cache behavior with stale/fresh entries
- Test rate limit threshold handling

**Integration tests:**

- Mock GitHub API responses with fixtures
- Load diff via GitHub path
- Verify `parseDiff()` produces identical output to local upload
- Verify diagram renders correctly

## Key Files to Create

- `src/types/github.ts` - All GitHub-related types and interfaces
- `src/lib/github-cache.ts` - Two-tier cache implementation
- `src/lib/github-adapter.ts` - GitHub API I/O layer
- `src/components/source-selector.ts` - Local vs GitHub toggle
- `src/components/github-inputs.ts` - Repo/branch/commit inputs
- `src/components/error-display.ts` - Error state UI

## Key Files to Modify

- `src/main.ts` - Add source selection, branch loading logic
- `src/types/index.ts` - Export GitHub types

## Dependencies

No new external dependencies required - use native `fetch()`, `IndexedDB`, and existing TypeScript setup.

### To-dos

- [ ] Create src/types/github.ts with all type definitions (GithubResource, CacheKey, CacheEntry, RepoCache, GithubClient, RateLimitInfo, API response types)
- [ ] Implement src/lib/github-cache.ts with two-tier caching (in-memory LRU + IndexedDB), key serialization, TTL handling, and rate-limit awareness
- [ ] Create src/lib/github-adapter.ts implementing GithubClient interface with all four methods (listBranches, listCommits, compare, getRaw) and rate limit tracking
- [ ] Create src/components/source-selector.ts to toggle between Local Upload and GitHub modes
- [ ] Create src/components/github-inputs.ts with repo input, branch dropdown, and commit picker UI
- [ ] Create src/components/error-display.ts to show loading, empty, rate-limit, and network error states
- [ ] Update src/main.ts to add source selector and branch diff loading based on source type (local vs github)
- [ ] Create test fixtures in tests/fixtures/github/ for branches, commits, compare responses, and unified diffs
- [ ] Write unit tests for github-cache.ts and github-adapter.ts covering cache behavior, normalization, and retry logic
- [ ] Write integration tests that mock GitHub API and verify end-to-end diff loading and rendering