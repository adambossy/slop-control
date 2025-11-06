import OpenAI from "openai";
import { z } from "zod";
// Import DOMPurify preload first to initialize globals and DOMPurify before mermaid loads
// This ensures DOM globals are set up and DOMPurify is initialized before mermaid imports it
import "../../shims/preload-dompurify.js";
import mermaid from "mermaid";
import type { EnsureRepoAtRefParams } from "@slop/github-repo-snapshot";
import { concatenateFiles } from "@slop/github-repo-snapshot";
import { buildArchitecturePrompt } from "./architecture-prompt-mermaid.js";

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
  // Allow browser-like environment detection since we set up window/document for DOMPurify
  // This is safe because we're running server-side, not in an actual browser
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
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

async function validateAndCorrectMermaidDiagram(
  conversation: Array<{ role: string; content: string }>,
  openaiClient: OpenAI,
  model: string,
  maxRetries = 3,
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const diagram = extractMermaidDiagram(
        conversation[conversation.length - 1].content,
      );
      // Validate the diagram using mermaid.parse()
      // parse() throws if invalid and suppressErrors is false
      await mermaid.parse(diagram, { suppressErrors: false });
      // If validation succeeds, return the diagram
      return diagram;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(
        `Failed to generate valid Mermaid diagram on this iteration. Error: ${errorMessage}`,
      );

      // If this is the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        throw new Error(
          `Failed to generate valid Mermaid diagram after ${maxRetries} attempts. Last error: ${errorMessage}`,
        );
      }

      // Prepare correction prompt
      const correctionPrompt = `The Mermaid diagram you generated has syntax errors. Please fix them while maintaining the architectural accuracy based on the original codebase analysis.

**Error from Mermaid parser:**
${errorMessage}

**CRITICAL: Mermaid Label Syntax Requirements**
- Labels containing ANY special characters (parentheses, slashes, hyphens, spaces, colons, commas, etc.) MUST be wrapped in double quotes.
- **INCORRECT:** \`A[Presentation (CLI/UI)]\` will cause parse errors
- **CORRECT:** \`A["Presentation (CLI/UI)"]\` (with double quotes around the label)
- When in doubt, wrap labels in double quotes. This is especially important if you see parse errors mentioning unexpected characters.
- This applies to ALL node labels, edge labels, and text content in the diagram.

Please provide the corrected Mermaid diagram code. Output ONLY the corrected diagram wrapped in \`\`\`mermaid code blocks, with no additional explanation.`;

      // Create new conversation with full history + correction request
      // originalConversation includes user messages and assistant responses
      const correctionInput = [
        ...conversation,
        {
          role: "user" as const,
          content: correctionPrompt,
        },
      ];

      // Request correction from LLM
      const correctionResponse = await openaiClient.responses.create({
        model,
        input: correctionInput as Parameters<
          typeof openaiClient.responses.create
        >[0]["input"],
      });

      const parsed = ResponsesResultSchema.parse(correctionResponse);
      const outputText = extractTextFromResponse(parsed);

      conversation.push({
        role: "assistant",
        content: outputText,
      });
    }
  }

  // This should never be reached due to the throw above, but TypeScript needs it
  throw new Error("Validation loop completed unexpectedly.");
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

  // Store original conversation for potential correction loops
  const conversation = [
    {
      role: "user",
      content: prompt,
    },
    {
      role: "user",
      content:
        "Outline approved. Provide the final Mermaid diagram, legend, and narrative summary now.",
    },
  ];

  const response = await openaiClient.responses.create({
    model,
    input: conversation as Parameters<
      typeof openaiClient.responses.create
    >[0]["input"],
  });

  const parsed = ResponsesResultSchema.parse(response);
  const outputText = extractTextFromResponse(parsed);

  // Build full conversation history including assistant response
  const fullConversation = [
    ...conversation,
    {
      role: "assistant",
      content: outputText,
    },
  ];

  // Validate and correct the diagram if needed
  const validatedDiagram = await validateAndCorrectMermaidDiagram(
    fullConversation,
    openaiClient,
    model,
  );

  return validatedDiagram;
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
  validateAndCorrectMermaidDiagram,
  setRepositoryFetcher,
  resetRepositoryFetcher,
};
