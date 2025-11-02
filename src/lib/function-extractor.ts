import type { ParsedDiff, FunctionNode, FunctionPattern, Hunk } from "@types";

/**
 * Patterns for detecting function definitions across languages
 */
const FUNCTION_PATTERNS: FunctionPattern[] = [
  {
    regex: /^\s*(?:async\s+)?function\s+(\w+)\s*\(/,
    lang: "js",
    type: "function",
  },
  {
    regex: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/,
    lang: "js",
    type: "arrow",
  },
  { regex: /^\s*(?:async\s+)?def\s+(\w+)\s*\(/, lang: "py", type: "function" },
  { regex: /^\s*class\s+(\w+)/, lang: "py", type: "class" },
  { regex: /^\s*func\s+(\w+)\s*\(/, lang: "go", type: "function" },
  {
    regex:
      /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/,
    lang: "java",
    type: "method",
  },
];

/**
 * Extract function definitions from parsed diff
 */
export function extractFunctions(diff: ParsedDiff): FunctionNode[] {
  const functions: FunctionNode[] = [];

  diff.files.forEach((file) => {
    const fileName = file.newPath || file.oldPath;

    file.hunks.forEach((hunk) => {
      hunk.lines.forEach((line, lineIdx) => {
        if (line.type === "addition" || line.type === "deletion") {
          for (const pattern of FUNCTION_PATTERNS) {
            const match = line.content.match(pattern.regex);
            if (match) {
              const functionName = match[1];
              if (!functionName) continue;

              const lineNumber =
                line.type === "addition"
                  ? hunk.newStart + lineIdx
                  : hunk.oldStart + lineIdx;

              const { additions, deletions } = countChangesInScope(
                hunk,
                lineIdx,
              );

              functions.push({
                name: functionName,
                file: fileName,
                shortFile: fileName.split("/").pop() || fileName,
                lineNumber,
                changeType:
                  line.type === "addition"
                    ? "addition"
                    : line.type === "deletion"
                      ? "deletion"
                      : "modification",
                additions,
                deletions,
                type: pattern.type,
                fullLine: line.content,
                hunk,
              });
              break;
            }
          }
        }
      });
    });
  });

  return functions;
}

/**
 * Count additions/deletions within a function's scope
 * Uses brace matching to determine scope boundaries
 */
function countChangesInScope(
  hunk: Hunk,
  startIdx: number,
): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  let scopeDepth = 0;
  let inFunction = false;

  for (let i = startIdx; i < hunk.lines.length && scopeDepth >= 0; i++) {
    const line = hunk.lines[i]!;
    if (i === startIdx) inFunction = true;

    if (inFunction) {
      if (line.content.includes("{")) scopeDepth++;
      if (line.content.includes("}")) scopeDepth--;

      if (line.type === "addition") additions++;
      if (line.type === "deletion") deletions++;

      if (scopeDepth === 0 && i > startIdx) break;
    }
  }

  return { additions, deletions };
}
