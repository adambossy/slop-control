#!/usr/bin/env bun

import {
  generateRepoArchitectureDiagram,
  enhanceArchitectureDiagramWithDiff,
} from "../server/src/lib/diagram/architecture-diagram-mermaid.js";
import { createGithubClient } from "../src/lib/github-adapter.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

function parseRepoUrl(url: string): { owner: string; repo: string } {
  // Support formats: https://github.com/owner/repo or owner/repo
  const match =
    url.match(/github\.com\/([^/]+)\/([^/]+)/) ||
    url.match(/^([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(
      `Invalid repo URL format: ${url}. Expected format: https://github.com/owner/repo or owner/repo`,
    );
  }
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

async function main() {
  const repoUrl = process.argv[2];
  const baseBranch = process.argv[3] || "main";
  const headRef = process.argv[4] || process.env.GITHUB_SHA;
  const model = process.argv[5] || "gpt-5";

  if (!repoUrl) {
    console.error(
      "Usage: bun run scripts/generate-architecture-diagram-mermaid-diff.ts <repo-url> [base-branch] [head-ref] [model]",
    );
    console.error(
      "Example: bun run scripts/generate-architecture-diagram-mermaid-diff.ts https://github.com/adambossy/promptorium main feature-branch gpt-5",
    );
    process.exit(1);
  }

  if (!headRef) {
    console.error(
      "Error: head-ref is required. Provide it as the 4th argument or set GITHUB_SHA environment variable.",
    );
    process.exit(1);
  }

  const { owner, repo } = parseRepoUrl(repoUrl);
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
    .replace("T", "-");

  const baseOutputFile = join(
    process.cwd(),
    `.diagrams/${repo}-architecture-diagram-${model}-${timestamp}.md`,
  );
  const diffOutputFile = join(
    process.cwd(),
    `.diagrams/${repo}-architecture-diagram-${model}-${timestamp}-diff.md`,
  );

  // eslint-disable-next-line no-console
  console.log(
    `Generating base architecture diagram for ${owner}/${repo}@${baseBranch}...`,
  );

  try {
    // Generate base diagram
    const { diagram: baseDiagram, conversation } =
      await generateRepoArchitectureDiagram({
        owner,
        repo,
        ref: baseBranch,
        model,
      });

    // Save base diagram
    const baseMarkdownContent = `# Architecture Diagram: ${owner}/${repo}

Generated from repository: https://github.com/${owner}/${repo}  
Ref: ${baseBranch}

\`\`\`mermaid
${baseDiagram}
\`\`\`
`;

    await writeFile(baseOutputFile, baseMarkdownContent, "utf-8");
    // eslint-disable-next-line no-console
    console.log(`✓ Base diagram saved to: ${baseOutputFile}`);

    // Get diff
    // eslint-disable-next-line no-console
    console.log(`Fetching diff between ${baseBranch} and ${headRef}...`);
    const github = createGithubClient();
    const { diff } = await github.compare({
      owner,
      repo,
      base: baseBranch,
      head: headRef,
    });

    if (!diff || diff.trim() === "") {
      // eslint-disable-next-line no-console
      console.log("No changes detected. Skipping enhanced diagram generation.");
      return;
    }

    // Enhance diagram with diff
    // eslint-disable-next-line no-console
    console.log("Enhancing diagram with diff context...");
    const { diagram: enhancedDiagram } =
      await enhanceArchitectureDiagramWithDiff({
        conversation,
        diff,
        model,
      });

    // Save enhanced diagram
    const enhancedMarkdownContent = `# Architecture Diagram (Enhanced with Diff): ${owner}/${repo}

Generated from repository: https://github.com/${owner}/${repo}  
Base: ${baseBranch}  
Head: ${headRef}

This diagram shows how changes in the diff impact the overall architecture.

\`\`\`mermaid
${enhancedDiagram}
\`\`\`
`;

    await writeFile(diffOutputFile, enhancedMarkdownContent, "utf-8");
    // eslint-disable-next-line no-console
    console.log(`✓ Enhanced diagram saved to: ${diffOutputFile}`);
  } catch (error) {
    console.error("Failed to generate architecture diagram:", error);
    process.exit(1);
  }
}

main();
