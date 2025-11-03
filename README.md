# Slop Control Monorepo (Bun Workspaces)

This repository uses Bun with npm-style workspaces.

- Root `package.json` declares:
  - `workspaces: ["packages/*", "server"]`
  - scripts:
    - `build` – builds the web app (Vite)
    - `build:workspaces` – builds workspace packages and server
    - `build:all` – builds both workspaces and web app
- Install and link packages via:

```bash
bun install
```

## Packages

### `@slop/github-repo-snapshot`

Location: `packages/github-repo-snapshot`

Library to snapshot a public GitHub repository at a specific ref into a temp cache and provide `.gitignore`-aware utilities:

- Primary API (uses owner/repo/ref and caches under the hood):
- `getDirectoryTree({ owner, repo, ref, options? })` → ASCII tree string
- `concatenateFiles({ owner, repo, ref, options? })` → single string of files, each preceded by a path header
- `iterConcatenatedFiles({ owner, repo, ref, options? })` → async generator that streams file sections

Default behavior:

- Shallow fetch (`--depth 1`) at the ref ⇒ full file tree at that commit, shallow history
- Honors `.gitignore` files (including nested) + default ignores: `.git/`, `node_modules/`, `dist/`, `build/`, `coverage/`, `.cache/`, `.venv/`
- Skips binary files and files > 256KB in concatenation by default
  Example usage:

```ts
import { getDirectoryTree, concatenateFiles } from "@slop/github-repo-snapshot";

const tree = await getDirectoryTree({
  owner: "octocat",
  repo: "Hello-World",
  ref: "main",
});
const text = await concatenateFiles({
  owner: "octocat",
  repo: "Hello-World",
  ref: "main",
});
```

Build package:

```bash
bun run -C packages/github-repo-snapshot build
```

### Server workspace

Location: `server`

The server is a workspace package that can consume `@slop/github-repo-snapshot` via `workspace:*` dependency.

Build server:

```bash
bun run -C server build
```

## Notes

- Submodules and Git LFS content are not processed in v1.
- Public repositories only (no auth) in v1.
