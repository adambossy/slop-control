/* test globals for type-check without installing vitest types */
declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeEach: any;

import type { ResponsesResult } from "../src/architecture-diagram.js";
import { buildArchitecturePrompt } from "../src/architecture-prompt.js";
import {
  __internal as architectureDiagramInternals,
  generateRepoArchitectureDiagram,
} from "../src/architecture-diagram.js";

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
    const fakeClient = {
      responses: {
        create: async () => ({
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
        }),
      },
    } as any;

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
      architectureDiagramInternals.resetRepositoryFetcher();
    }
  });
});
