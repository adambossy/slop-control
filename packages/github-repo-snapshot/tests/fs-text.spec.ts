/* test globals for type-check without installing vitest types */
declare const describe: any;
declare const it: any;
declare const expect: any;
import { concatenateFiles, getDirectoryTree } from "../src/index.js";

const run = process.env.CI_NO_NET ? it.skip : it;

describe("fs-text (public API owner/repo/ref only)", () => {
  run("renders a tree and concatenates using owner/repo/ref", async () => {
    const owner = "octocat";
    const repo = "Spoon-Knife";
    const ref = "main";

    const tree = await getDirectoryTree({ owner, repo, ref });
    expect(typeof tree).toBe("string");
    expect(tree.length).toBeGreaterThan(0);

    const text = await concatenateFiles({ owner, repo, ref });
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });
});
