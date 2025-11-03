import { describe, it, expect } from "vitest";
import { getDirectoryTree, concatenateFiles } from "../src/index.js";

const run = process.env.CI_NO_NET ? it.skip : it;

describe("integration: public GitHub repo", () => {
  run("fetches a public repo at ref and generates outputs", async () => {
    const tree = await getDirectoryTree({
      owner: "octocat",
      repo: "Spoon-Knife",
      ref: "main",
    });
    expect(tree.length).toBeGreaterThan(0);

    const text = await concatenateFiles({
      owner: "octocat",
      repo: "Spoon-Knife",
      ref: "main",
    });
    expect(text.length).toBeGreaterThan(0);
  });
});
