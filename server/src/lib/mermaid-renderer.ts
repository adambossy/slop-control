import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execAsync = promisify(exec);

export async function renderMermaidToSvg(diagramCode: string): Promise<string> {
  const tmpInput = join(
    tmpdir(),
    `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}.mmd`,
  );
  const tmpOutput = join(
    tmpdir(),
    `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}.svg`,
  );

  try {
    await writeFile(tmpInput, diagramCode, "utf-8");

    const mmdcPath = join(process.cwd(), "node_modules", ".bin", "mmdc");
    await execAsync(
      `"${mmdcPath}" -i "${tmpInput}" -o "${tmpOutput}" -t dark -b transparent`,
    );

    const svg = await readFile(tmpOutput, "utf-8");
    return svg;
  } finally {
    await unlink(tmpInput).catch(() => undefined);
    await unlink(tmpOutput).catch(() => undefined);
  }
}

export async function validateMermaid(diagramCode: string): Promise<boolean> {
  try {
    await renderMermaidToSvg(diagramCode);
    return true;
  } catch {
    return false;
  }
}
