import type { GithubClient } from "@types";

interface BranchItem {
  name: string;
  commitSha: string;
}
interface CommitItem {
  sha: string;
  message: string;
  author?: string;
}

interface GithubInputsEventMap {
  repoValid: (repo: string) => void;
  branchSelected: (branch: string) => void;
  fetch: (args: {
    owner: string;
    repo: string;
    base: string;
    head: string;
  }) => void;
}

export class GithubInputs {
  private listeners = new Map<
    keyof GithubInputsEventMap,
    Set<GithubInputsEventMap[keyof GithubInputsEventMap]>
  >();
  private client: GithubClient | null = null;

  constructor(
    private repoInput: HTMLInputElement,
    private branchSelect: HTMLSelectElement,
    private baseInput: HTMLInputElement,
    private headInput: HTMLInputElement,
    private fetchButton: HTMLButtonElement,
  ) {
    this.attachHandlers();
  }

  // Inject client for convenience (optional). Network calls are orchestrated by main controller.
  setClient(client: GithubClient): void {
    this.client = client;
    void this.client;
  }

  private attachHandlers(): void {
    this.repoInput.addEventListener("blur", () => {
      const valid = this.isValidRepo(this.repoInput.value);
      this.repoInput.classList.toggle("input-error", !valid);
      if (valid) {
        this.emit("repoValid", this.repoInput.value);
      }
    });

    this.branchSelect.addEventListener("change", () => {
      this.emit("branchSelected", this.branchSelect.value);
    });

    this.fetchButton.addEventListener("click", () => {
      const repo = this.repoInput.value.trim();
      if (!this.isValidRepo(repo)) {
        return;
      }
      const [owner, repoName] = repo.split("/") as [string, string];
      const base = this.baseInput.value.trim();
      const head = this.headInput.value.trim();
      this.emit("fetch", { owner, repo: repoName, base, head });
    });
  }

  isValidRepo(value: string): boolean {
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.trim());
  }

  setBranches(branches: BranchItem[]): void {
    this.branchSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a branch";
    this.branchSelect.appendChild(placeholder);

    branches.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.name;
      opt.textContent = `${b.name} (${b.commitSha.slice(0, 7)})`;
      this.branchSelect.appendChild(opt);
    });
  }

  setCommits(_commits: CommitItem[]): void {
    // Placeholder for future enhancement: wire to datalist/autocomplete
  }

  on<E extends keyof GithubInputsEventMap>(
    event: E,
    handler: GithubInputsEventMap[E],
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    (this.listeners.get(event) as Set<GithubInputsEventMap[E]>).add(handler);
  }

  private emit<E extends keyof GithubInputsEventMap>(
    event: E,
    ...args: Parameters<GithubInputsEventMap[E]>
  ): void {
    (
      this.listeners.get(event) as Set<GithubInputsEventMap[E]> | undefined
    )?.forEach((h) => (h as (...a: unknown[]) => void)(...(args as unknown[])));
  }

  destroy(): void {
    this.listeners.clear();
  }
}
