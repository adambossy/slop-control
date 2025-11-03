export interface EnsureRepoAtRefParams {
  owner: string;
  repo: string;
  ref: string; // branch, tag, or full/short SHA
}

export interface EnsureRepoAtRefResult {
  workdir: string;
  commitSha: string;
}

export interface TreeOptions {
  respectGitignore?: boolean;
  additionalIgnoreGlobs?: string[];
}

export interface ConcatOptions {
  respectGitignore?: boolean;
  additionalIgnoreGlobs?: string[];
  maxFileSizeBytes?: number; // default 262_144
  treatBinaryAsIgnored?: boolean; // default true
}
