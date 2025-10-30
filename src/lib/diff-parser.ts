import type { ParsedDiff, DiffFile, Hunk, DiffLine } from '@types';

/**
 * Parse unified diff format into structured data
 */
export function parseDiff(diffText: string): ParsedDiff {
  const files: DiffFile[] = [];
  const lines = diffText.split('\n');

  let currentFile: DiffFile | null = null;
  let currentHunk: Hunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // New file
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        files.push(currentFile);
      }
      const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
      currentFile = {
        oldPath: match?.[1] || '',
        newPath: match?.[2] || '',
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      currentHunk = null;
    }
    // File paths
    else if (line.startsWith('---')) {
      if (currentFile) {
        currentFile.oldPath = line.substring(4).replace(/^a\//, '');
      }
    } else if (line.startsWith('+++')) {
      if (currentFile) {
        currentFile.newPath = line.substring(4).replace(/^b\//, '');
      }
    }
    // Hunk header
    else if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/);
      currentHunk = {
        oldStart: parseInt(match?.[1] || '0'),
        oldLines: parseInt(match?.[2] || '1'),
        newStart: parseInt(match?.[3] || '0'),
        newLines: parseInt(match?.[4] || '1'),
        header: match?.[5]?.trim() || '',
        lines: [],
      };
      if (currentFile) {
        currentFile.hunks.push(currentHunk);
      }
    }
    // Hunk content
    else if (
      currentHunk &&
      (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))
    ) {
      const type: DiffLine['type'] =
        line[0] === '+' ? 'addition' : line[0] === '-' ? 'deletion' : 'context';

      currentHunk.lines.push({
        type,
        content: line.substring(1),
      });

      if (type === 'addition' && currentFile) currentFile.additions++;
      if (type === 'deletion' && currentFile) currentFile.deletions++;
    }
  }

  if (currentFile) {
    files.push(currentFile);
  }

  return { files };
}


