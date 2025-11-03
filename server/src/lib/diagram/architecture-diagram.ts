import OpenAI from "openai";
import { z } from "zod";
import type { EnsureRepoAtRefParams } from "@slop/github-repo-snapshot";
import { concatenateFiles } from "@slop/github-repo-snapshot";
import { buildArchitecturePrompt } from "./architecture-prompt.js";

export type GenerateRepoArchitectureDiagramParams = EnsureRepoAtRefParams & {
  /** Override the OpenAI model identifier. */
  model?: string;
  /** Preconfigured OpenAI client, primarily for testing. */
  client?: OpenAI;
};

const ResponseContentSchema = z
  .object({
    type: z.string(),
    text: z.string().optional().nullable(),
  })
  .passthrough();

const ResponseOutputSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    content: z.array(ResponseContentSchema).optional(),
  })
  .passthrough();

const ResponsesResultSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    output_text: z.string().optional(),
    output: z.array(ResponseOutputSchema).optional(),
  })
  .passthrough();

export type ResponsesResult = z.infer<typeof ResponsesResultSchema>;

function ensureClient(client: OpenAI | undefined): OpenAI {
  if (client) {
    return client;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }
  return new OpenAI({ apiKey });
}

function extractTextFromResponse(result: ResponsesResult): string {
  if (result.output_text && result.output_text.trim()) {
    return result.output_text.trim();
  }

  if (result.output && result.output.length > 0) {
    const collected: string[] = [];
    for (const item of result.output) {
      if (item.text) {
        collected.push(item.text);
      }
      if (item.content) {
        for (const contentItem of item.content) {
          if (contentItem.text) {
            collected.push(contentItem.text);
          }
        }
      }
    }
    const combined = collected.join("\n").trim();
    if (combined) {
      return combined;
    }
  }

  throw new Error("Responses API payload did not include textual output.");
}

function extractMermaidDiagram(text: string): string {
  const mermaidMatch = text.match(/```mermaid\s*([\s\S]*?)```/i);
  if (mermaidMatch && mermaidMatch[1]) {
    const diagram = mermaidMatch[1].trim();
    if (diagram) {
      return diagram;
    }
  }

  throw new Error("Unable to locate Mermaid diagram in model response.");
}

type RepositoryFetcher = (params: EnsureRepoAtRefParams) => Promise<string>;

let repositoryFetcher: RepositoryFetcher = concatenateFiles;

export async function generateRepoArchitectureDiagram(
  params: GenerateRepoArchitectureDiagramParams,
): Promise<string> {
  const { owner, repo, ref, model = "gpt-5", client } = params;

  const codebaseListing = await repositoryFetcher({ owner, repo, ref });
  const prompt = buildArchitecturePrompt({ codebaseListing });
  const openaiClient = ensureClient(client);

  const response = await openaiClient.responses.create({
    model,
    input: [
      {
        role: "user",
        content: prompt,
      },
      {
        role: "user",
        content:
          "Outline approved. Provide the final Mermaid diagram, legend, and narrative summary now.",
      },
    ],
  });

  const parsed = ResponsesResultSchema.parse(response);
  const outputText = extractTextFromResponse(parsed);
  return extractMermaidDiagram(outputText);
}

function setRepositoryFetcher(fetcher: RepositoryFetcher): void {
  repositoryFetcher = fetcher;
}

function resetRepositoryFetcher(): void {
  repositoryFetcher = concatenateFiles;
}

export const __internal = {
  ResponsesResultSchema,
  extractTextFromResponse,
  extractMermaidDiagram,
  setRepositoryFetcher,
  resetRepositoryFetcher,
};
