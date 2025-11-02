import { showLoading, showError, showEmptyState } from "../utils/dom-helpers";

export class ErrorDisplay {
  private countdownTimer: number | null = null;

  constructor(private container: HTMLElement) {}

  loading(message = "Loading..."): void {
    this.clearTimer();
    showLoading(this.container, message);
  }

  empty(message: string): void {
    this.clearTimer();
    showEmptyState(this.container, message);
  }

  networkError(message = "Network error. Please try again."): void {
    this.clearTimer();
    showError(this.container, message);
  }

  rateLimited(resetEpochSeconds: number): void {
    this.clearTimer();
    const update = (): void => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, resetEpochSeconds - now);
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      showError(
        this.container,
        `Rate limit reached. Retry in ${mins}:${secs.toString().padStart(2, "0")}`,
      );
    };
    update();
    this.countdownTimer = window.setInterval(update, 1000);
  }

  clear(): void {
    this.clearTimer();
    this.container.innerHTML = "";
  }

  private clearTimer(): void {
    if (this.countdownTimer != null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}
