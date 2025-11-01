import './styles/main.css';

import { DiagramRenderer } from '@components/diagram-renderer';
import { DiffViewer } from '@components/diff-viewer';
import { FileUploader } from '@components/file-uploader';
import { SourceSelector } from '@components/source-selector';
import { GithubInputs } from '@components/github-inputs';
import { ErrorDisplay } from '@components/error-display';

import { getElement } from './utils/dom-helpers';
import { parseDiff } from '@lib/diff-parser';
import { extractFunctions } from '@lib/function-extractor';
import { generateMermaidDiagram } from '@lib/diagram-generator';
// import { extractCallHierarchy } from '@lib/call-hierarchy-analyzer';
import { createGithubClient } from '@lib/github-adapter';

/**
 * Code Review Tool - Main Application
 */
class CodeReviewApp {
  private diagram: DiagramRenderer;
  private diffViewer: DiffViewer;
  private uploader: FileUploader;
  private sourceSelector: SourceSelector | null = null;
  private githubInputs: GithubInputs | null = null;
  private githubStatus: ErrorDisplay | null = null;

  private parsedDiff: any = null;
  private currentFile: any = null;

  constructor() {
    // Initialize components
    this.diagram = new DiagramRenderer(getElement('#mermaid-diagram'));
    this.diffViewer = new DiffViewer(getElement('#diff-content'));
    // Call hierarchy panel temporarily disabled

    const fileInput = getElement<HTMLInputElement>('#diff-file');
    const fileName = getElement('#file-name');
    this.uploader = new FileUploader(fileInput, fileName);

    // GitHub source controls (if present in DOM)
    const localRadio = document.querySelector<HTMLInputElement>('#source-local');
    const githubRadio = document.querySelector<HTMLInputElement>('#source-github');
    const githubControls = document.getElementById('github-controls');
    const fileWrapper = document.querySelector('.file-input-wrapper') as HTMLElement | null;
    const repoInput = document.querySelector<HTMLInputElement>('#github-repo');
    const branchSelect = document.querySelector<HTMLSelectElement>('#github-branch');
    const baseInput = document.querySelector<HTMLInputElement>('#github-base');
    const headInput = document.querySelector<HTMLInputElement>('#github-head');
    const fetchBtn = document.querySelector<HTMLButtonElement>('#github-fetch');
    const statusEl = document.querySelector<HTMLElement>('#github-status');

    if (
      localRadio &&
      githubRadio &&
      githubControls &&
      fileWrapper &&
      repoInput &&
      branchSelect &&
      baseInput &&
      headInput &&
      fetchBtn &&
      statusEl
    ) {
      this.sourceSelector = new SourceSelector(localRadio, githubRadio);
      this.githubInputs = new GithubInputs(
        repoInput,
        branchSelect,
        baseInput,
        headInput,
        fetchBtn
      );
      this.githubStatus = new ErrorDisplay(statusEl);

      const githubClient = createGithubClient();
      this.githubInputs.setClient(githubClient);

      this.sourceSelector.on('sourceChange', (source) => {
        if (source === 'github') {
          if (githubControls) githubControls.style.display = '';
          if (fileWrapper) fileWrapper.style.display = 'none';
        } else {
          if (githubControls) githubControls.style.display = 'none';
          if (fileWrapper) fileWrapper.style.display = '';
        }
      });

      this.githubInputs.on('repoValid', async (repoStr: string) => {
        const [owner, repo] = repoStr.split('/') as [string, string];
        try {
          this.githubStatus?.loading('Loading branches...');
          const { branches } = await githubClient.listBranches({ owner, repo });
          this.githubInputs?.setBranches(branches);
          this.githubStatus?.clear();
        } catch (e: any) {
          this.githubStatus?.networkError('Failed to load branches');
          console.error(e);
        }
      });

      this.githubInputs.on('branchSelected', async (branchName: string) => {
        const repoStr = repoInput.value.trim();
        if (!repoStr) return;
        const [owner, repo] = repoStr.split('/') as [string, string];
        try {
          // Optional: prefetch commits to assist user input later
          await githubClient.listCommits({ owner, repo, sha: branchName, per_page: 50 });
        } catch (e) {
          // non-fatal
        }
      });

      this.githubInputs.on(
        'fetch',
        async ({ owner, repo, base, head }: { owner: string; repo: string; base: string; head: string }) => {
          try {
            this.githubStatus?.loading('Fetching diff...');
            const { diff } = await githubClient.compare({ owner, repo, base, head });
            this.githubStatus?.clear();
            await this.handleDiffLoad(diff, 'github');
          } catch (e: any) {
            // If we can extract rate limit reset, show countdown
            const resetHeader = (e?.headers?.get && e.headers.get('x-ratelimit-reset')) || null;
            if (resetHeader) {
              this.githubStatus?.rateLimited(Number(resetHeader));
            } else {
              this.githubStatus?.networkError('Failed to fetch diff');
            }
            console.error('GitHub fetch error:', e);
          }
        }
      );
    }

    // Mark fields as used during scaffolding
    void this.parsedDiff;
    void this.currentFile;

    this.setupEventHandlers();
    console.log('Code Review Tool initialized');
  }

  private setupEventHandlers(): void {
    // File upload
    this.uploader.on('fileLoaded', (content) => {
      this.handleFileLoad(content);
    });

    // Diagram interactions
    this.diagram.on('nodeClick', (funcNode) => {
      this.handleNodeClick(funcNode);
    });

    // Text selection for call hierarchy temporarily disabled
  }

  private async handleFileLoad(content: string): Promise<void> {
    try {
      this.parsedDiff = parseDiff(content);
      console.log('Parsed diff:', this.parsedDiff);
      console.log('Files found:', this.parsedDiff.files.length);

      const functions = extractFunctions(this.parsedDiff);
      console.log('Functions found:', functions.length);
      console.log('Functions:', functions);

      const diagramCode = generateMermaidDiagram(functions, this.parsedDiff);
      console.log('Mermaid diagram:', diagramCode);
      await this.diagram.render(functions, diagramCode);
    } catch (error) {
      console.error('Error parsing diff:', error);
    }
  }

  private async handleDiffLoad(content: string, _source: 'local' | 'github'): Promise<void> {
    try {
      this.parsedDiff = parseDiff(content);
      console.log('Parsed diff:', this.parsedDiff);
      console.log('Files found:', this.parsedDiff.files.length);

      const functions = extractFunctions(this.parsedDiff);
      console.log('Functions found:', functions.length);
      console.log('Functions:', functions);

      const diagramCode = generateMermaidDiagram(functions, this.parsedDiff);
      console.log('Mermaid diagram:', diagramCode);
      await this.diagram.render(functions, diagramCode);
    } catch (error) {
      console.error('Error parsing diff:', error);
    }
  }

  private handleNodeClick(funcNode: any): void {
    console.log('Node clicked:', funcNode);
    const file = this.parsedDiff?.files.find(
      (f: any) => f.newPath === funcNode.file || f.oldPath === funcNode.file
    );
    if (file) {
      this.currentFile = file;
      this.diffViewer.showFunction(file, funcNode);
    }
  }

  // Call hierarchy interactions temporarily removed

  destroy(): void {
    this.diagram.destroy();
    this.diffViewer.destroy();
    this.uploader.destroy();
  }
}

// Initialize app when DOM is ready
const app = new CodeReviewApp();

// Make app globally accessible for debugging
(window as any).app = app;
