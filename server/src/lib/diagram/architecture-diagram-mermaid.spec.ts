import type { FinalRequestOptions } from "openai/core";
import type { ResponsesResult } from "./architecture-diagram-mermaid.js";
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

const { buildArchitecturePrompt } = await import("./architecture-prompt-mermaid.js");
const {
  __internal: architectureDiagramInternals,
  generateRepoArchitectureDiagram,
} = await import("./architecture-diagram-mermaid.js");
const { default: OpenAI } = await import("openai");

describe("architecture diagram prompt", () => {
  it("prepends the fixed header before the listing", () => {
    const listing = "===== /file.txt =====\nconsole.log('hi');";
    const prompt = buildArchitecturePrompt({ codebaseListing: listing });
    expect(prompt.endsWith(listing)).toBe(true);
  });

  it("keeps a single blank line between header and listing", () => {
    const listing = "===== /file.txt =====\nconsole.log('hi');";
    const prompt = buildArchitecturePrompt({ codebaseListing: listing });
    const header = prompt.slice(0, prompt.length - listing.length);
    expect(header.endsWith("\n\n")).toBe(true);
  });
});

describe("responses parsing flow", () => {
  const {
    ResponsesResultSchema,
    extractTextFromResponse,
    extractMermaidDiagram,
  } = architectureDiagramInternals;

  let baseResponse: ResponsesResult;

  beforeEach(() => {
    baseResponse = {
      id: "resp_test",
      status: "completed",
      output_text: "```mermaid\nflowchart TD\n```",
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
              text: "```mermaid\nflowchart TD\n```",
            },
          ],
        },
      ],
    } as ResponsesResult;
    const parsed = ResponsesResultSchema.parse(variant);
    expect(extractTextFromResponse(parsed)).toContain("flowchart TD");
  });

  it("throws when no Mermaid block is present", () => {
    const text = "no diagram here";
    expect(() => extractMermaidDiagram(text)).toThrow();
  });
});

describe("generateRepoArchitectureDiagram", () => {
  it("requests a diagram and returns the Mermaid block", async () => {
    const listing = "===== /file.txt =====\nconsole.log('hi');";
    let receivedArgs: unknown;
    const expectedMermaid = "flowchart TD\nA-->B";
    const fakeClient = new OpenAI({ apiKey: "test" });
    const responsePayload = {
      id: "resp_fake",
      status: "completed",
      output_text: [
        "Here you go.",
        "",
        "```mermaid",
        expectedMermaid,
        "```",
      ].join("\n"),
      output: [],
    } satisfies ResponsesResult;
    createImplementation = () => createApiPromise(responsePayload);

    try {
      architectureDiagramInternals.setRepositoryFetcher(async (args) => {
        receivedArgs = args;
        return listing;
      });
      const result = await generateRepoArchitectureDiagram({
        owner: "octocat",
        repo: "Hello-World",
        ref: "main",
        client: fakeClient,
        model: "test-model",
      });

      expect(result).toBe(expectedMermaid);
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
