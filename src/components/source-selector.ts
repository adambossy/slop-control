type SourceType = "local" | "github";

export class SourceSelector {
  private listeners = new Map<string, Set<Function>>();
  private current: SourceType = "local";

  constructor(
    private localEl: HTMLInputElement,
    private githubEl: HTMLInputElement,
  ) {
    this.current = this.localEl.checked
      ? "local"
      : this.githubEl.checked
        ? "github"
        : "local";
    this.localEl.addEventListener("change", this.handleChange);
    this.githubEl.addEventListener("change", this.handleChange);
  }

  private handleChange = (): void => {
    const next: SourceType = this.githubEl.checked ? "github" : "local";
    if (next !== this.current) {
      this.current = next;
      this.emit("sourceChange", this.current);
    }
  };

  on(event: "sourceChange", handler: (source: SourceType) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  getSource(): SourceType {
    return this.current;
  }

  destroy(): void {
    this.listeners.clear();
    this.localEl.removeEventListener("change", this.handleChange);
    this.githubEl.removeEventListener("change", this.handleChange);
  }
}
