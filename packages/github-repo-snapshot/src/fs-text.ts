import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { posix as pathPosix } from "node:path";
import ignore from "ignore";
import type {
  ConcatOptions,
  TreeOptions,
  EnsureRepoAtRefParams,
} from "./types.js";
import { ensureRepoAtRef } from "./git.js";

const DEFAULT_MAX_FILE_SIZE = 262_144; // 256 KB

const DEFAULT_IGNORES = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".venv",
];

function normalizeRel(pathFromRoot: string): string {
  return pathFromRoot.split("\\").join("/");
}

async function readGitignoreFile(absDir: string): Promise<string[] | null> {
  try {
    const contents = await readFile(join(absDir, ".gitignore"), "utf8");
    const lines = contents.split(/\r?\n/);
    const patterns: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      patterns.push(line);
    }
    return patterns;
  } catch {
    return null;
  }
}

function prefixPatternsForDir(
  dirRelPath: string,
  patterns: string[],
): string[] {
  if (!patterns.length) {
    return patterns;
  }
  if (!dirRelPath) {
    return patterns;
  }
  const prefixed: string[] = [];
  for (const pat of patterns) {
    // Handle negation
    const isNeg = pat.startsWith("!");
    const base = isNeg ? pat.slice(1) : pat;
    const anchored = base.startsWith("/");
    const baseNoSlash = anchored ? base.slice(1) : base;
    const joined = dirRelPath ? `${dirRelPath}/${baseNoSlash}` : baseNoSlash;
    prefixed.push(isNeg ? `!${joined}` : joined);
  }
  return prefixed;
}

interface WalkOptions {
  workdir: string;
  respectGitignore: boolean;
  additionalIgnoreGlobs?: string[];
}

async function listIncludedFiles(
  workdir: string,
  options: WalkOptions,
): Promise<string[]> {
  const { respectGitignore, additionalIgnoreGlobs } = options;
  const collected: string[] = [];

  const rootIgPatterns: string[] = [...DEFAULT_IGNORES];
  if (additionalIgnoreGlobs && additionalIgnoreGlobs.length) {
    rootIgPatterns.push(...additionalIgnoreGlobs);
  }

  async function walk(
    absDir: string,
    dirRelPath: string,
    inheritedPatterns: string[],
  ): Promise<void> {
    const localPatterns = respectGitignore
      ? await readGitignoreFile(absDir)
      : null;
    const combined = [
      ...inheritedPatterns,
      ...prefixPatternsForDir(dirRelPath, localPatterns ?? []),
    ];
    const ig = ignore().add(combined);

    const entries = await readdir(absDir, { withFileTypes: true });
    // Sort for stable output
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const childRel = dirRelPath ? `${dirRelPath}/${entry.name}` : entry.name;
      const relForCheck = normalizeRel(
        entry.isDirectory() ? `${childRel}/` : childRel,
      );
      if (ig.ignores(relForCheck)) {
        continue;
      }

      const childAbs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        await walk(childAbs, childRel, combined);
      } else if (entry.isFile()) {
        collected.push(normalizeRel(childRel));
      }
    }
  }

  await walk(workdir, "", rootIgPatterns);
  return collected;
}

function buildTreeStructure(files: string[]): TreeNode {
  const root: TreeNode = { name: "", subdirs: new Map(), files: [] };
  for (const rel of files) {
    const parts = rel.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      if (isFile) {
        node.files.push(part);
      } else {
        if (!node.subdirs.has(part)) {
          node.subdirs.set(part, { name: part, subdirs: new Map(), files: [] });
        }
        node = node.subdirs.get(part)!;
      }
    }
  }
  // Sort files and subdirs recursively
  sortTree(root);
  return root;
}

interface TreeNode {
  name: string;
  subdirs: Map<string, TreeNode>;
  files: string[];
}

function sortTree(node: TreeNode): void {
  node.files.sort((a, b) => a.localeCompare(b));
  // Recreate map in sorted order
  const sortedEntries = Array.from(node.subdirs.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  node.subdirs = new Map(sortedEntries);
  for (const [, child] of node.subdirs) {
    sortTree(child);
  }
}

function renderTree(node: TreeNode): string {
  const lines: string[] = [];

  function renderDir(current: TreeNode, prefix: string): void {
    const subdirNames = Array.from(current.subdirs.keys());
    const entries: Array<{ name: string; type: "dir" | "file" }> = [
      ...subdirNames.map((n) => ({ name: n, type: "dir" as const })),
      ...current.files.map((n) => ({ name: n, type: "file" as const })),
    ];
    entries.forEach((entry, index) => {
      const isLast = index === entries.length - 1;
      const connector = isLast ? "└── " : "├── ";
      lines.push(`${prefix}${connector}${entry.name}`);
      if (entry.type === "dir") {
        const child = current.subdirs.get(entry.name)!;
        const nextPrefix = `${prefix}${isLast ? "    " : "│   "}`;
        renderDir(child, nextPrefix);
      }
    });
  }

  renderDir(node, "");
  return lines.join("\n");
}

async function isBinaryFile(absPath: string): Promise<boolean> {
  try {
    const data = await readFile(absPath);
    return isBinaryBuffer(data);
  } catch {
    return true;
  }
}

function isBinaryBuffer(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192);
  let suspicious = 0;
  for (let i = 0; i < len; i++) {
    const byte = buf[i]!;
    if (byte === 0) {
      return true;
    } // Null byte
    // Allow common whitespace and printable ASCII (9..13, 32..126)
    if (
      byte === 9 ||
      byte === 10 ||
      byte === 13 ||
      (byte >= 32 && byte <= 126)
    ) {
      continue;
    }
    suspicious++;
  }
  // If more than 30% of bytes are non-printable, treat as binary
  return suspicious / len > 0.3;
}

export async function getDirectoryTree(
  params: EnsureRepoAtRefParams & { options?: TreeOptions },
): Promise<string> {
  const { workdir } = await ensureRepoAtRef(params);
  const options = params.options;
  const respectGitignore = options?.respectGitignore !== false;
  const files = await listIncludedFiles(workdir, {
    workdir,
    respectGitignore,
    additionalIgnoreGlobs: options?.additionalIgnoreGlobs,
  });
  const tree = buildTreeStructure(files);
  return renderTree(tree);
}

export async function* iterConcatenatedFiles(
  params: EnsureRepoAtRefParams & { options?: ConcatOptions },
): AsyncGenerator<string> {
  const { workdir } = await ensureRepoAtRef(params);
  const options = params.options;
  const respectGitignore = options?.respectGitignore !== false;
  const maxFileSize = options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE;
  const treatBinaryAsIgnored = options?.treatBinaryAsIgnored ?? true;

  const files = await listIncludedFiles(workdir, {
    workdir,
    respectGitignore,
    additionalIgnoreGlobs: options?.additionalIgnoreGlobs,
  });

  for (const rel of files) {
    const abs = join(workdir, rel);
    const st = await stat(abs);
    if (st.size > maxFileSize) {
      continue;
    }
    const binary = await isBinaryFile(abs);
    if (binary && treatBinaryAsIgnored) {
      continue;
    }
    const content = binary ? "" : await readFile(abs, "utf8");
    const header = `===== /${normalizeRel(rel)} =====\n`;
    yield header + content + (content.endsWith("\n") ? "" : "\n");
  }
}

export async function concatenateFiles(
  params: EnsureRepoAtRefParams & { options?: ConcatOptions },
): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of iterConcatenatedFiles(params)) {
    parts.push(chunk);
  }
  return parts.join("");
}
