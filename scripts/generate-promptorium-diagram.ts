#!/usr/bin/env bun

import { generateRepoArchitectureDiagram } from "../packages/github-repo-snapshot/src/index.js";
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

  if (!repoUrl) {
    console.error(
      "Usage: bun run scripts/generate-promptorium-diagram.ts <repo-url>",
    );
    console.error(
      "Example: bun run scripts/generate-promptorium-diagram.ts https://github.com/adambossy/promptorium",
    );
    process.exit(1);
  }

  const { owner, repo } = parseRepoUrl(repoUrl);
  const ref = "main";
  const outputFile = join(
    process.cwd(),
    `.diagrams/${repo}-architecture-diagram.md`,
  );

  console.log(`Generating architecture diagram for ${owner}/${repo}@${ref}...`); // eslint-disable-line no-console

  try {
    const mermaidDiagram = await generateRepoArchitectureDiagram({
      owner,
      repo,
      ref,
    });

    const markdownContent = `# Architecture Diagram: ${owner}/${repo}

Generated from repository: https://github.com/${owner}/${repo}  
Ref: ${ref}

\`\`\`mermaid
${mermaidDiagram}
\`\`\`
`;

    await writeFile(outputFile, markdownContent, "utf-8");

    console.log(`✓ Diagram saved to: ${outputFile}`); // eslint-disable-line no-console
  } catch (error) {
    console.error("Failed to generate architecture diagram:", error);
    process.exit(1);
  }
}

main();
