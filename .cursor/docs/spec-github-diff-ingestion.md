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
