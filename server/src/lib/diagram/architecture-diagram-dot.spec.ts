import type { FinalRequestOptions } from "openai/core";
import type { ResponsesResult } from "./architecture-diagram-dot.js";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { APIPromise } from "openai/core";

interface ResponsesCreateRequest {
  model: string;
  input: Array<{
    role: string;
    content: string;
  }>;
}

type CreateImpl = (
  request: ResponsesCreateRequest,
) => APIPromise<ResponsesResult>;

let createImplementation: CreateImpl | undefined;

// Mock node:child_process BEFORE importing modules that use it
mock.module("node:child_process", () => ({
  execSync: (
    command: string,
    options?: { input?: string; stdio?: unknown },
  ) => {
    if (command === "which dot") {
      // Simulate dot command existing
      return "/usr/bin/dot";
    }
    if (command === "dot -Tdot") {
      // Simulate successful validation
      if (!options?.input) {
        throw new Error("No input provided to dot command");
      }
      // Basic validation: check if it looks like valid DOT
      const input = options.input;
      if (!input.includes("digraph") && !input.includes("graph")) {
        throw new Error("DOT syntax error: missing graph declaration");
      }
      return input; // Return the input as if dot processed it
    }
    throw new Error(`Unexpected command: ${command}`);
  },
}));

mock.module("openai", () => {
  class MockOpenAI {
    public responses = {
      create: (request: ResponsesCreateRequest) => {
        if (!createImplementation) {
          throw new Error("Mock create not implemented.");
        }
        return createImplementation(request);
      },
    };

    constructor(_config?: { apiKey?: string }) {
      void _config;
    }
  }

  return { default: MockOpenAI };
});

const { buildArchitecturePromptDot } = await import(
  "./architecture-prompt-dot.js"
);
const {
  __internal: architectureDiagramInternals,
  generateRepoArchitectureDiagramDot,
} = await import("./architecture-diagram-dot.js");
const { default: OpenAI } = await import("openai");

describe("architecture diagram prompt", () => {
  it("prepends the fixed header before the listing", () => {
    const listing = "===== /file.txt =====\nconsole.log('hi');";
    const prompt = buildArchitecturePromptDot({ codebaseListing: listing });
    expect(prompt.endsWith(listing)).toBe(true);
  });

  it("keeps a single blank line between header and listing", () => {
    const listing = "===== /file.txt =====\nconsole.log('hi');";
    const prompt = buildArchitecturePromptDot({ codebaseListing: listing });
    const header = prompt.slice(0, prompt.length - listing.length);
    expect(header.endsWith("\n\n")).toBe(true);
  });
});

describe("responses parsing flow", () => {
  const { ResponsesResultSchema, extractTextFromResponse, extractDotDiagram } =
    architectureDiagramInternals;

  let baseResponse: ResponsesResult;

  beforeEach(() => {
    baseResponse = {
      id: "resp_test",
      status: "completed",
      output_text: "```dot\ndigraph G {\n}\n```",
    } as ResponsesResult;
  });

  it("prefers output_text when available", () => {
    const parsed = ResponsesResultSchema.parse(baseResponse);
    expect(extractTextFromResponse(parsed)).toBe(baseResponse.output_text);
  });

  it("falls back to aggregated output blocks when output_text is missing", () => {
    const variant: ResponsesResult = {
      id: "resp_test",
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "```dot\ndigraph G {\n}\n```",
            },
          ],
        },
      ],
    } as ResponsesResult;
    const parsed = ResponsesResultSchema.parse(variant);
    expect(extractTextFromResponse(parsed)).toContain("digraph G");
  });

  it("throws when no DOT block is present", () => {
    const text = "no diagram here";
    expect(() => extractDotDiagram(text)).toThrow();
  });

  it("extracts DOT diagram from ```dot code blocks", () => {
    const text = "Here is the diagram:\n```dot\ndigraph G {\n  A -> B\n}\n```";
    const diagram = extractDotDiagram(text);
    expect(diagram).toBe("digraph G {\n  A -> B\n}");
  });

  it("extracts DOT diagram from ```graphviz code blocks", () => {
    const text =
      "Here is the diagram:\n```graphviz\ndigraph G {\n  A -> B\n}\n```";
    const diagram = extractDotDiagram(text);
    expect(diagram).toBe("digraph G {\n  A -> B\n}");
  });
});

describe("generateRepoArchitectureDiagramDot", () => {
  it("requests a diagram and returns the DOT block", async () => {
    const listing = "===== /file.txt =====\nconsole.log('hi');";
    let receivedArgs: unknown;
    const expectedDot = "digraph G {\n  A -> B\n}";
    const fakeClient = new OpenAI({ apiKey: "test" });
    const responsePayload = {
      id: "resp_fake",
      status: "completed",
      output_text: ["Here you go.", "", "```dot", expectedDot, "```"].join(
        "\n",
      ),
      output: [],
    } satisfies ResponsesResult;
    createImplementation = () => createApiPromise(responsePayload);

    try {
      architectureDiagramInternals.setRepositoryFetcher(async (args) => {
        receivedArgs = args;
        return listing;
      });
      const result = await generateRepoArchitectureDiagramDot({
        owner: "octocat",
        repo: "Hello-World",
        ref: "main",
        client: fakeClient,
        model: "test-model",
      });

      expect(result).toBe(expectedDot);
      expect(receivedArgs).toEqual({
        owner: "octocat",
        repo: "Hello-World",
        ref: "main",
      });
    } finally {
      createImplementation = undefined;
      architectureDiagramInternals.resetRepositoryFetcher();
    }
  });
});

function createApiPromise(data: ResponsesResult): APIPromise<ResponsesResult> {
  const controller = new AbortController();
  const response = new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
  const options = {
    method: "post",
    path: "/responses",
  } satisfies FinalRequestOptions;
  return new APIPromise(
    Promise.resolve({
      response,
      options,
      controller,
    }),
    async () => data,
  );
}
