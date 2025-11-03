export {
  getDirectoryTree,
  concatenateFiles,
  iterConcatenatedFiles,
} from "./fs-text.js";
export {
  buildArchitecturePrompt,
  getArchitecturePromptHeader,
  type BuildArchitecturePromptParams,
} from "./lib/diagram/architecture-prompt.js";
export {
  generateRepoArchitectureDiagram,
  type GenerateRepoArchitectureDiagramParams,
  __internal as architectureDiagramInternals,
} from "./lib/diagram/architecture-diagram.js";
export type {
  EnsureRepoAtRefParams,
  EnsureRepoAtRefResult,
  TreeOptions,
  ConcatOptions,
} from "./types.js";
