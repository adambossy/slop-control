import type { FunctionNode, ParsedDiff } from "@types";

/**
 * Generate Mermaid diagram syntax from function nodes
 */
export function generateMermaidDiagram(
  functions: FunctionNode[],
  diff: ParsedDiff,
): string {
  if (functions.length === 0) {
    return "graph TD\n    A[No function changes detected]";
  }

  let diagram = "graph TD\n";
  const nodes = new Map<
    string,
    { id: string; func: FunctionNode; index: number }
  >();

  // Create nodes for each function
  functions.forEach((func, index) => {
    const id = `func${index}`;
    const changeCount = func.additions + func.deletions;
    const symbol =
      func.changeType === "addition"
        ? "+"
        : func.changeType === "deletion"
          ? "-"
          : "±";

    const label = `${func.name}<br/>${func.shortFile}<br/>${symbol}${changeCount} lines`;
    diagram += `    ${id}["${label}"]\n`;

    // Color based on change type
    const color =
      func.changeType === "addition"
        ? "#1e3c1e"
        : func.changeType === "deletion"
          ? "#4b1818"
          : "#0e639c";

    diagram += `    style ${id} fill:${color},stroke:#1177bb,color:#fff\n`;

    nodes.set(func.name, { id, func, index });
  });

  // Find function call relationships
  functions.forEach((func, index) => {
    const currentId = `func${index}`;

    // Look for function calls in this function's lines
    diff.files.forEach((file) => {
      if (file.newPath === func.file || file.oldPath === func.file) {
        file.hunks.forEach((hunk) => {
          hunk.lines.forEach((line) => {
            // Search for calls to other functions in our list
            functions.forEach((targetFunc, targetIndex) => {
              if (targetFunc.name !== func.name) {
                const callPattern = new RegExp(
                  `\\b${targetFunc.name}\\s*\\(`,
                  "g",
                );
                if (callPattern.test(line.content)) {
                  const targetId = `func${targetIndex}`;
                  const edge = `    ${currentId} --> ${targetId}\n`;
                  // Avoid duplicate edges
                  if (!diagram.includes(edge)) {
                    diagram += edge;
                  }
                }
              }
            });
          });
        });
      }
    });
  });

  return diagram;
}
