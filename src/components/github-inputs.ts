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

export class GithubInputs {
  private listeners = new Map<string, Set<Function>>();
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

  on(
    event: "repoValid" | "branchSelected" | "fetch",
    handler: (arg: any) => void,
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach((h) => h(...args));
  }

  destroy(): void {
    this.listeners.clear();
  }
}
