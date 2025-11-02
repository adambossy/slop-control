import type {
  GithubClient,
  GithubCompareResponse,
  RepoCache,
  CacheEntry,
  CacheKey,
  RateLimitInfo,
} from "@types";
import { GithubRepoCache } from "./github-cache";

const GITHUB_API_BASE = "https://api.github.com";

function buildUrl(
  path: string,
  params?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path, GITHUB_API_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

function isSha(ref: string): boolean {
  return /^[a-f0-9]{40}$/i.test(ref);
}

function toUnifiedDiff(filename: string, patch?: string): string {
  const safePatch = patch ?? "";
  const header = `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n`;
  return header + safePatch + (safePatch.endsWith("\n") ? "" : "\n");
}

function updateRateLimit(
  info: RateLimitInfo | null,
  headers: Headers,
): RateLimitInfo {
  const limit = Number(headers.get("x-ratelimit-limit") ?? info?.limit ?? 60);
  const remaining = Number(
    headers.get("x-ratelimit-remaining") ?? info?.remaining ?? 60,
  );
  const reset = Number(headers.get("x-ratelimit-reset") ?? info?.reset ?? 0);
  return { limit, remaining, reset };
}

export class GithubAdapter implements GithubClient {
  private cache: RepoCache;
  private rateLimit: RateLimitInfo | null = null;

  constructor(cache?: RepoCache) {
    this.cache = cache ?? new GithubRepoCache(100);
  }

  async listBranches(args: {
    owner: string;
    repo: string;
    per_page?: number;
  }): Promise<{
    branches: Array<{ name: string; commitSha: string }>;
    fromCache: boolean;
  }> {
    const { owner, repo, per_page = 100 } = args;
    const key: CacheKey = {
      namespace: "github:v1",
      resource: "branches",
      owner,
      repo,
    };
    const cached =
      await this.cache.get<Array<{ name: string; commitSha: string }>>(key);
    if (cached) {
      this.revalidateBranches(key, owner, repo, per_page, cached.meta);
      return { branches: cached.data, fromCache: true };
    }

    const url = buildUrl(`/repos/${owner}/${repo}/branches`, { per_page });
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    this.rateLimit = updateRateLimit(this.rateLimit, res.headers);
    if (!res.ok) {
      throw new Error(`GitHub branches failed: ${res.status}`);
    }
    const json: Array<{ name: string; commit: { sha: string } }> =
      await res.json();
    const branches = json.map((b) => ({
      name: b.name,
      commitSha: b.commit.sha,
    }));
    const entry: CacheEntry<typeof branches> = {
      data: branches,
      meta: {
        createdAt: Date.now(),
        ttlMs: 3 * 60 * 1000,
        url,
        schemaVersion: "v1",
        etag: res.headers.get("etag") ?? undefined,
        lastModified: res.headers.get("last-modified") ?? undefined,
      },
    };
    await this.cache.set(key, entry);
    return { branches, fromCache: false };
  }

  private async revalidateBranches(
    key: CacheKey,
    owner: string,
    repo: string,
    per_page: number,
    meta: CacheEntry<unknown>["meta"],
  ): Promise<void> {
    // Skip if close to rate limit
    if (this.rateLimit && this.rateLimit.remaining <= 1) {
      return;
    }
    const url = buildUrl(`/repos/${owner}/${repo}/branches`, { per_page });
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    if (meta.etag) {
      headers["If-None-Match"] = meta.etag;
    }
    if (meta.lastModified) {
      headers["If-Modified-Since"] = meta.lastModified;
    }
    void fetch(url, { headers }).then(async (res) => {
      this.rateLimit = updateRateLimit(this.rateLimit, res.headers);
      if (res.status === 304) {
        return;
      }
      if (!res.ok) {
        return;
      }
      const json: Array<{ name: string; commit: { sha: string } }> =
        await res.json();
      const branches = json.map((b) => ({
        name: b.name,
        commitSha: b.commit.sha,
      }));
      const entry: CacheEntry<typeof branches> = {
        data: branches,
        meta: {
          createdAt: Date.now(),
          ttlMs: 3 * 60 * 1000,
          url,
          schemaVersion: "v1",
          etag: res.headers.get("etag") ?? undefined,
          lastModified: res.headers.get("last-modified") ?? undefined,
        },
      };
      await this.cache.set(key, entry);
    });
  }

  async listCommits(args: {
    owner: string;
    repo: string;
    sha: string;
    per_page?: number;
  }): Promise<{
    commits: Array<{ sha: string; message: string; author?: string }>;
    fromCache: boolean;
  }> {
    const { owner, repo, sha, per_page = 100 } = args;
    const key: CacheKey = {
      namespace: "github:v1",
      resource: "commits",
      owner,
      repo,
      branch: sha,
    };
    const cached =
      await this.cache.get<
        Array<{ sha: string; message: string; author?: string }>
      >(key);
    if (cached) {
      this.revalidateCommits(key, owner, repo, sha, per_page, cached.meta);
      return { commits: cached.data, fromCache: true };
    }

    const url = buildUrl(`/repos/${owner}/${repo}/commits`, { sha, per_page });
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    this.rateLimit = updateRateLimit(this.rateLimit, res.headers);
    if (!res.ok) {
      throw new Error(`GitHub commits failed: ${res.status}`);
    }
    const json: Array<{
      sha: string;
      commit: { message: string; author?: { name: string } };
    }> = await res.json();
    const commits = json.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author?.name,
    }));
    const entry: CacheEntry<typeof commits> = {
      data: commits,
      meta: {
        createdAt: Date.now(),
        ttlMs: 3 * 60 * 1000,
        url,
        schemaVersion: "v1",
        etag: res.headers.get("etag") ?? undefined,
        lastModified: res.headers.get("last-modified") ?? undefined,
      },
    };
    await this.cache.set(key, entry);
    return { commits, fromCache: false };
  }

  private async revalidateCommits(
    key: CacheKey,
    owner: string,
    repo: string,
    sha: string,
    per_page: number,
    meta: CacheEntry<unknown>["meta"],
  ): Promise<void> {
    if (this.rateLimit && this.rateLimit.remaining <= 1) {
      return;
    }
    const url = buildUrl(`/repos/${owner}/${repo}/commits`, { sha, per_page });
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    if (meta.etag) {
      headers["If-None-Match"] = meta.etag;
    }
    if (meta.lastModified) {
      headers["If-Modified-Since"] = meta.lastModified;
    }
    void fetch(url, { headers }).then(async (res) => {
      this.rateLimit = updateRateLimit(this.rateLimit, res.headers);
      if (res.status === 304) {
        return;
      }
      if (!res.ok) {
        return;
      }
      const json: Array<{
        sha: string;
        commit: { message: string; author?: { name: string } };
      }> = await res.json();
      const commits = json.map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author?.name,
      }));
      const entry: CacheEntry<typeof commits> = {
        data: commits,
        meta: {
          createdAt: Date.now(),
          ttlMs: 3 * 60 * 1000,
          url,
          schemaVersion: "v1",
          etag: res.headers.get("etag") ?? undefined,
          lastModified: res.headers.get("last-modified") ?? undefined,
        },
      };
      await this.cache.set(key, entry);
    });
  }

  async compare(args: {
    owner: string;
    repo: string;
    base: string;
    head: string;
  }): Promise<{ diff: string; fromCache: boolean }> {
    const { owner, repo, base, head } = args;
    const key: CacheKey = {
      namespace: "github:v1",
      resource: "compare",
      owner,
      repo,
      base,
      head,
    };
    const cached = await this.cache.get<string>(key);
    if (cached) {
      // Immutable compare by SHAs; no TTL set => skip revalidate unless desired
      return { diff: cached.data, fromCache: true };
    }

    const url = buildUrl(`/repos/${owner}/${repo}/compare/${base}...${head}`);
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    this.rateLimit = updateRateLimit(this.rateLimit, res.headers);
    if (!res.ok) {
      throw new Error(`GitHub compare failed: ${res.status}`);
    }
    const json: GithubCompareResponse = await res.json();
    const unified = (json.files ?? [])
      .map((f) => toUnifiedDiff(f.filename, f.patch))
      .join("");

    const entry: CacheEntry<string> = {
      data: unified,
      meta: {
        createdAt: Date.now(),
        // immutable when both are SHAs
        ttlMs: isSha(base) && isSha(head) ? undefined : 3 * 60 * 1000,
        url,
        schemaVersion: "v1",
        etag: res.headers.get("etag") ?? undefined,
        lastModified: res.headers.get("last-modified") ?? undefined,
      },
    };
    await this.cache.set(key, entry);
    return { diff: unified, fromCache: false };
  }

  async getRaw(args: {
    owner: string;
    repo: string;
    ref: string;
    path: string;
  }): Promise<{ content: string; fromCache: boolean }> {
    const { owner, repo, ref, path } = args;
    const key: CacheKey = {
      namespace: "github:v1",
      resource: "raw",
      owner,
      repo,
      ref,
      path,
    };
    const cached = await this.cache.get<string>(key);
    if (cached) {
      return { content: cached.data, fromCache: true };
    }

    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
    const res = await fetch(url, { headers: { Accept: "text/plain" } });
    this.rateLimit = updateRateLimit(this.rateLimit, res.headers);
    if (!res.ok) {
      throw new Error(`GitHub raw failed: ${res.status}`);
    }
    const text = await res.text();
    const entry: CacheEntry<string> = {
      data: text,
      meta: {
        createdAt: Date.now(),
        ttlMs: isSha(ref) ? undefined : 3 * 60 * 1000,
        url,
        schemaVersion: "v1",
        etag: res.headers.get("etag") ?? undefined,
        lastModified: res.headers.get("last-modified") ?? undefined,
      },
    };
    await this.cache.set(key, entry);
    return { content: text, fromCache: false };
  }
}

export function createGithubClient(cache?: RepoCache): GithubClient {
  return new GithubAdapter(cache);
}
