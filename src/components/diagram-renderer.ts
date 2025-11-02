import mermaid from "mermaid";
import svgPanZoom from "svg-pan-zoom";
import type { FunctionNode } from "@types";
import { showLoading, showError } from "../utils/dom-helpers";

export class DiagramRenderer {
  private listeners = new Map<string, Set<Function>>();
  private functionNodes: FunctionNode[] = [];
  private initialized = false;
  private panZoom: SvgPanZoom.Instance | undefined;
  private zoomInBtn: HTMLButtonElement | null = null;
  private zoomOutBtn: HTMLButtonElement | null = null;
  private resetBtn: HTMLButtonElement | null = null;
  private zoomPercentageEl: HTMLElement | null = null;
  private onResizeHandler: (() => void) | null = null;

  constructor(private container: HTMLElement) {
    this.initMermaid();
  }

  private initMermaid(): void {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      themeVariables: {
        darkMode: true,
        background: "#1e1e1e",
        primaryColor: "#0e639c",
        primaryTextColor: "#d4d4d4",
        primaryBorderColor: "#3e3e42",
        lineColor: "#858585",
        secondaryColor: "#2d2d30",
        tertiaryColor: "#1e1e1e",
      },
    });
    this.initialized = true;
  }

  async render(functions: FunctionNode[], diagramCode: string): Promise<void> {
    if (!this.initialized) {
      this.initMermaid();
    }

    this.functionNodes = functions;
    showLoading(this.container, "Rendering diagram...");

    try {
      const { svg } = await mermaid.render("diagram", diagramCode);
      this.container.innerHTML = svg;
      this.ensureControlsInitialized();
      const svgEl = this.container.querySelector("svg") as SVGSVGElement | null;
      if (svgEl) {
        this.attachPanZoom(svgEl);
      }
      this.attachClickHandlers();
    } catch (error) {
      console.error("Error rendering diagram:", error);
      showError(this.container, "Failed to render diagram");
    }
  }

  on(event: "nodeClick", handler: (funcNode: FunctionNode) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach((handler) => handler(...args));
  }

  private attachClickHandlers(): void {
    const nodes = this.container.querySelectorAll(".node");

    nodes.forEach((node, index) => {
      (node as HTMLElement).style.cursor = "pointer";

      node.addEventListener("click", () => {
        nodes.forEach((n) => n.classList.remove("node-highlight"));
        node.classList.add("node-highlight");

        if (this.functionNodes[index]) {
          this.emit("nodeClick", this.functionNodes[index]);
        }
      });
    });
  }

  destroy(): void {
    this.listeners.clear();
    this.teardownPanZoom();
    this.teardownControls();
    this.container.innerHTML = "";
  }

  private attachPanZoom(svgEl: SVGSVGElement): void {
    if (this.panZoom) {
      this.panZoom.destroy();
      this.panZoom = undefined;
    }

    this.panZoom = svgPanZoom(svgEl, {
      controlIconsEnabled: false,
      zoomEnabled: true,
      panEnabled: true,
      fit: true,
      center: true,
      minZoom: 0.5,
      maxZoom: 4,
      zoomScaleSensitivity: 0.2,
      onZoom: () => this.updateZoomPercentage(),
    });

    // Initial fit/center and percentage display
    this.panZoom.fit();
    this.panZoom.center();
    this.updateZoomPercentage();

    // Attach resize handler once
    if (!this.onResizeHandler) {
      this.onResizeHandler = () => {
        if (this.panZoom) {
          this.panZoom.resize();
          this.panZoom.fit();
          this.panZoom.center();
          this.updateZoomPercentage();
        }
      };
      window.addEventListener("resize", this.onResizeHandler);
    }
  }

  private teardownPanZoom(): void {
    if (this.panZoom) {
      this.panZoom.destroy();
      this.panZoom = undefined;
    }
    if (this.onResizeHandler) {
      window.removeEventListener("resize", this.onResizeHandler);
      this.onResizeHandler = null;
    }
  }

  private ensureControlsInitialized(): void {
    if (
      this.zoomInBtn &&
      this.zoomOutBtn &&
      this.resetBtn &&
      this.zoomPercentageEl
    ) {
      return;
    }

    this.zoomInBtn = document.getElementById(
      "diagram-zoom-in",
    ) as HTMLButtonElement | null;
    this.zoomOutBtn = document.getElementById(
      "diagram-zoom-out",
    ) as HTMLButtonElement | null;
    this.resetBtn = document.getElementById(
      "diagram-zoom-reset",
    ) as HTMLButtonElement | null;
    this.zoomPercentageEl = document.getElementById("diagram-zoom-percentage");

    if (this.zoomInBtn) {
      this.zoomInBtn.addEventListener("click", this.handleZoomInClick);
    }
    if (this.zoomOutBtn) {
      this.zoomOutBtn.addEventListener("click", this.handleZoomOutClick);
    }
    if (this.resetBtn) {
      this.resetBtn.addEventListener("click", this.handleResetClick);
    }

    // Initialize visible percentage
    this.updateZoomPercentage();
  }

  private teardownControls(): void {
    if (this.zoomInBtn) {
      this.zoomInBtn.removeEventListener("click", this.handleZoomInClick);
    }
    if (this.zoomOutBtn) {
      this.zoomOutBtn.removeEventListener("click", this.handleZoomOutClick);
    }
    if (this.resetBtn) {
      this.resetBtn.removeEventListener("click", this.handleResetClick);
    }
    this.zoomInBtn = null;
    this.zoomOutBtn = null;
    this.resetBtn = null;
    this.zoomPercentageEl = null;
  }

  private handleZoomInClick = (): void => {
    if (this.panZoom) {
      this.panZoom.zoomIn();
    }
  };

  private handleZoomOutClick = (): void => {
    if (this.panZoom) {
      this.panZoom.zoomOut();
    }
  };

  private handleResetClick = (): void => {
    if (this.panZoom) {
      this.panZoom.resetZoom();
      this.panZoom.fit();
      this.panZoom.center();
      this.updateZoomPercentage();
    }
  };

  private updateZoomPercentage(): void {
    if (!this.zoomPercentageEl) {
      return;
    }
    const percent = this.panZoom
      ? Math.round(this.panZoom.getZoom() * 100)
      : 100;
    this.zoomPercentageEl.textContent = `${percent}%`;
  }
}
