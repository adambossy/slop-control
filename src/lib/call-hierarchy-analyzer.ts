import type { ParsedDiff, DiffFile, CallHierarchy, CallSite } from '@types';

const FUNCTION_PATTERNS = [
  /function\s+(\w+)/,
  /const\s+(\w+)\s*=/,
  /def\s+(\w+)/,
  /func\s+(\w+)/,
  /(\w+)\s*\(/,
];

/**
 * Extract call hierarchy for selected code
 */
export function extractCallHierarchy(
  selectedText: string,
  currentFile: DiffFile,
  parsedDiff: ParsedDiff
): CallHierarchy | null {
  let functionName: string | null = null;

  for (const pattern of FUNCTION_PATTERNS) {
    const match = selectedText.match(pattern);
    if (match) {
      functionName = match[1] || match[0].replace(/\s*\(.*/, '');
      break;
    }
  }

  if (!functionName) {
    return null;
  }

  const incomingCalls: CallSite[] = [];
  const outgoingCalls: CallSite[] = [];

  parsedDiff.files.forEach((file) => {
    file.hunks.forEach((hunk) => {
      hunk.lines.forEach((line, lineIdx) => {
        const content = line.content;

        const callPattern = new RegExp(`\\b${functionName}\\s*\\(`, 'g');
        if (
          callPattern.test(content) &&
          !content.includes(`function ${functionName}`) &&
          !content.includes(`def ${functionName}`)
        ) {
          incomingCalls.push({
            file: file.newPath || file.oldPath,
            line: lineIdx + hunk.newStart,
            content: content.trim(),
            type: line.type,
          });
        }

        if (file === currentFile) {
          const outgoingPattern = /(\w+)\s*\(/g;
          let match: RegExpExecArray | null;

          while ((match = outgoingPattern.exec(content)) !== null) {
            const calledFunction = match[1] ?? '';

            if (
              calledFunction !== '' &&
              calledFunction !== functionName &&
              !['if', 'for', 'while', 'return', 'function', 'const', 'let', 'var'].includes(
                calledFunction
              )
            ) {
              outgoingCalls.push({
                file: file.newPath || file.oldPath,
                line: lineIdx + hunk.newStart,
                content: content.trim(),
                functionName: calledFunction,
                type: line.type,
              });
            }
          }
        }
      });
    });
  });

  const uniqueOutgoing = [
    ...new Map(outgoingCalls.map((c) => [c.functionName ?? '', c])).values(),
  ];

  return {
    targetFunction: functionName,
    signature: (selectedText.split('\n')[0] ?? '').trim(),
    incomingCalls: incomingCalls.slice(0, 10),
    outgoingCalls: uniqueOutgoing.slice(0, 10),
  };
}


