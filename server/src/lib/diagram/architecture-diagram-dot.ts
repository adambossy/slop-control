import OpenAI from "openai";
import { z } from "zod";
import { execSync } from "node:child_process";
import type { EnsureRepoAtRefParams } from "@slop/github-repo-snapshot";
import { concatenateFiles } from "@slop/github-repo-snapshot";
import { buildArchitecturePromptDot } from "./architecture-prompt-dot.js";

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

function extractDotDiagram(text: string): string {
  // Match ```dot or ```graphviz code blocks
  const dotMatch = text.match(/```(?:dot|graphviz)\s*([\s\S]*?)```/i);
  if (dotMatch && dotMatch[1]) {
    const diagram = dotMatch[1].trim();
    if (diagram) {
      return diagram;
    }
  }

  throw new Error("Unable to locate Graphviz DOT diagram in model response.");
}

function validateDotDiagram(diagram: string): void {
  try {
    // Check if dot command exists
    try {
      execSync("which dot", { stdio: "ignore" });
    } catch {
      throw new Error(
        "Graphviz 'dot' command not found. Please install Graphviz. " +
          "On macOS: brew install graphviz, On Ubuntu/Debian: sudo apt-get install graphviz, " +
          "On Windows: choco install graphviz or download from https://graphviz.org/download/",
      );
    }

    // Validate DOT syntax by running dot -Tdot (outputs DOT format)
    // This will throw if the syntax is invalid
    // Use stdin to pass the diagram content
    execSync("dot -Tdot", {
      input: diagram,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
  } catch (error) {
    if (error instanceof Error) {
      // If it's already our custom error, rethrow it
      if (error.message.includes("Graphviz 'dot' command not found")) {
        throw error;
      }
      // Try to extract meaningful error from stderr if available
      const errorMessage =
        error.message || "Unknown DOT syntax error";
      throw new Error(`DOT syntax validation failed: ${errorMessage}`);
    }
    throw new Error(
      `DOT syntax validation failed: ${String(error)}`,
    );
  }
}

async function validateAndCorrectDotDiagram(
  conversation: Array<{ role: string; content: string }>,
  openaiClient: OpenAI,
  model: string,
  maxRetries = 3,
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const diagram = extractDotDiagram(
        conversation[conversation.length - 1].content,
      );
      // Validate the diagram using dot CLI
      validateDotDiagram(diagram);
      // If validation succeeds, return the diagram
      return diagram;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(
        `Failed to generate valid Graphviz DOT diagram on this iteration. Error: ${errorMessage}`,
      );

      // If this is the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        throw new Error(
          `Failed to generate valid Graphviz DOT diagram after ${maxRetries} attempts. Last error: ${errorMessage}`,
        );
      }

      // Prepare correction prompt
      const correctionPrompt = `The Graphviz DOT diagram you generated has syntax errors. Please fix them while maintaining the architectural accuracy based on the original codebase analysis.

**Error from Graphviz parser:**
${errorMessage}

**CRITICAL: Graphviz DOT Syntax Requirements**
- Node IDs must be valid identifiers (letters, numbers, underscores) or quoted strings
- Labels containing ANY special characters (parentheses, slashes, hyphens, spaces, colons, commas, etc.) MUST be wrapped in double quotes: \`[label="Node Label"]\`
- Directed graphs use \`digraph G {\`, undirected graphs use \`graph G {\`
- Edges use \`->\` for directed (digraph) or \`--\` for undirected (graph)
- Attributes use \`[key=value, key2=value2]\` syntax
- All strings containing special characters must be quoted
- **INCORRECT:** \`node1[label=Presentation (CLI/UI)]\` will cause parse errors
- **CORRECT:** \`node1[label="Presentation (CLI/UI)"]\` (with double quotes around the label)
- When in doubt, wrap labels in double quotes. This is especially important if you see parse errors mentioning unexpected characters.
- This applies to ALL node labels, edge labels, and text content in the diagram.

Please provide the corrected Graphviz DOT diagram code. Output ONLY the corrected diagram wrapped in \`\`\`dot code blocks, with no additional explanation.`;

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

export async function generateRepoArchitectureDiagramDot(
  params: GenerateRepoArchitectureDiagramParams,
): Promise<string> {
  const { owner, repo, ref, model = "gpt-5", client } = params;

  const codebaseListing = await repositoryFetcher({ owner, repo, ref });
  const prompt = buildArchitecturePromptDot({ codebaseListing });
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
        "Outline approved. Provide the final Graphviz DOT diagram, legend, and narrative summary now.",
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
  const validatedDiagram = await validateAndCorrectDotDiagram(
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
  extractDotDiagram,
  validateAndCorrectDotDiagram,
  setRepositoryFetcher,
  resetRepositoryFetcher,
};
