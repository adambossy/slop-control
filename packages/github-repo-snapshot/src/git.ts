import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { EnsureRepoAtRefParams, EnsureRepoAtRefResult } from "./types.js";

const execFile = promisify(execFileCb);

function getCacheDir(): string {
  return join(os.tmpdir(), "slop-control", "github-cache");
}

function getWorkdirPath(owner: string, repo: string, ref: string): string {
  return join(getCacheDir(), owner, repo, ref);
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runGit(
  args: string[],
  cwd: string,
  allowFailure = false,
): Promise<{ stdout: string; stderr: string } | null> {
  try {
    const { stdout, stderr } = await execFile("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });
    return { stdout, stderr };
  } catch (err) {
    if (allowFailure) {
      return null;
    }
    throw err;
  }
}

export async function ensureRepoAtRef(
  params: EnsureRepoAtRefParams,
): Promise<EnsureRepoAtRefResult> {
  const { owner, repo, ref } = params;
  const workdir = getWorkdirPath(owner, repo, ref);
  const remoteUrl = `https://github.com/${owner}/${repo}.git`;

  await ensureDir(workdir);

  // Initialize repo (safe to re-run)
  await runGit(["init"], workdir);

  // Ensure origin points to correct remote
  await runGit(["remote", "remove", "origin"], workdir, true);
  await runGit(["remote", "add", "origin", remoteUrl], workdir);

  // Fetch shallow ref and checkout detached HEAD
  await runGit(["fetch", "--depth", "1", "origin", ref], workdir);
  await runGit(["checkout", "--detach", "FETCH_HEAD"], workdir);

  const rev = await runGit(["rev-parse", "HEAD"], workdir);
  const commitSha = (rev?.stdout ?? "").trim();

  return { workdir, commitSha };
}

export const _internal = { getCacheDir, getWorkdirPath, pathExists };
