// GitHub-related type definitions and client interfaces
// These types cover API response shapes, cache interfaces, and the GithubClient surface

// =========================
// API Response Types (subset used)
// =========================

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

export interface GithubCompareFile {
  filename: string;
  status: string; // added | modified | removed | renamed | etc.
  patch?: string; // unified diff for the file
  additions: number;
  deletions: number;
}

export interface GithubCompareResponse {
  files: GithubCompareFile[];
}

// =========================
// Cache Types
// =========================

export type GithubResource = "branches" | "commits" | "compare" | "raw";

export interface CacheKey {
  namespace: string; // e.g., 'github:v1'
  resource: GithubResource;
  owner: string;
  repo: string;
  branch?: string;
  sha?: string; // for commit alias
  base?: string; // base SHA
  head?: string; // head SHA
  ref?: string; // for raw
  path?: string; // for raw
}

export interface CacheEntry<T> {
  data: T;
  meta: {
    etag?: string;
    lastModified?: string;
    createdAt: number; // ms epoch
    ttlMs?: number; // only for mutable resources
    url?: string;
    params?: Record<string, string>;
    schemaVersion: string; // e.g., 'v1'
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

// =========================
// Client Interface
// =========================

export type UnifiedDiffText = string; // unified diff that feeds existing parseDiff()

export interface GithubClient {
  listBranches(args: {
    owner: string;
    repo: string;
    per_page?: number;
  }): Promise<{
    branches: { name: string; commitSha: string }[];
    fromCache: boolean;
  }>;

  listCommits(args: {
    owner: string;
    repo: string;
    sha: string; // branch name or SHA
    per_page?: number;
  }): Promise<{
    commits: { sha: string; message: string; author?: string }[];
    fromCache: boolean;
  }>;

  compare(args: {
    owner: string;
    repo: string;
    base: string;
    head: string;
  }): Promise<{ diff: UnifiedDiffText; fromCache: boolean }>;

  getRaw(args: {
    owner: string;
    repo: string;
    ref: string; // branch or SHA
    path: string;
  }): Promise<{ content: string; fromCache: boolean }>;
}

export interface RateLimitInfo {
  remaining: number;
  reset: number; // epoch seconds from header
  limit: number;
}
