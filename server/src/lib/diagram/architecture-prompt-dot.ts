export interface BuildArchitecturePromptParams {
  /**
   * Complete concatenated repository listing, including path headers and file contents.
   */
  codebaseListing: string;
}

const PROMPT_HEADER = `You are an expert software architect tasked with synthesizing an architectural diagram from a full codebase listing. The listing will include project layout (file paths), source code, configuration files, and documentation.

**Goal**
Produce a single diagram that captures the system's most important structural and behavioral characteristics so that senior engineers can quickly understand how the system is organized and how data flows through it.

**Expectations**

1. Architectural Viewpoint
   - Focus on the level where services/modules/components interact, not on individual functions.
   - Emphasize separation of concerns: identify boundaries between presentation, domain logic, infrastructure, integrations, and supporting utilities.
   - Highlight any layered patterns (e.g., adapter/hexagonal architecture), microservices, or modular boundaries.

2. Dataflow & Control Flow
   - Trace primary request/response paths and background workflows.
   - Call out critical data sources (databases, queues, caches, third-party APIs) and how data moves between them and the code.
   - Note synchronous vs. asynchronous interactions, batching, streaming, or event-driven behavior.

3. Key Abstractions
   - Capture core domain entities, services, controllers, jobs, pipelines, or state machines.
   - Include major configuration points (feature flags, env-based behaviors) if they shape runtime structure.

4. Operational Context
   - Mention deployment topology: processes, containers, cloud services, serverless functions.
   - Include observability/debug hooks (logging, metrics, tracing) if they materially affect architecture.
   - Reflect security and compliance boundaries (auth flows, permission enforcement, secrets handling).

5. Supporting Details
   - Note third-party dependencies and SDKs that materially influence design.
   - Surface cross-cutting concerns (error handling, validation, caching, retries).
   - Show extension or plugin points if the code supports customization.

6. Diagram Output Requirements
   - Output must be Graphviz DOT.
   - Use a professional software architecture notation (e.g., C4, UML component, layered view) appropriate to the system scale.
   - Provide a short legend and concise callouts for complex edges.
   - Offer a paragraph summary explaining how to read the diagram and the key takeaways.

7. Graphviz DOT Syntax Requirements (CRITICAL - MUST FOLLOW)
   - **Directed graphs:** Use \`digraph G {\` to start a directed graph
   - **Undirected graphs:** Use \`graph G {\` to start an undirected graph
   - **Node IDs:** Must be valid identifiers (letters, numbers, underscores) or quoted strings. Examples: \`node1\`, \`"Node Name"\`, \`API_Service\`
   - **Node labels:** Labels containing special characters (parentheses, slashes, hyphens, spaces, colons, commas, etc.) MUST be quoted. Use \`[label="Node Label"]\` syntax.
   - **INCORRECT (will fail):**
     - \`node1[label=Presentation (CLI/UI)]\`
     - \`node2[label=Cloud-Name]\`
     - \`node3[label=Service: API]\`
   - **CORRECT (required format):**
     - \`node1[label="Presentation (CLI/UI)"]\`
     - \`node2[label="Cloud-Name"]\`
     - \`node3[label="Service: API"]\`
   - **Safe labels (no quotes needed for simple identifiers):**
     - \`User[label=User]\`
     - \`Database[label=Database]\`
     - \`API_Service[label=API_Service]\`
   - **Edges:** Directed graphs use \`->\`, undirected graphs use \`--\`. Examples: \`node1 -> node2\`, \`node1 -- node2\`
   - **Edge labels:** Use \`[label="Edge Label"]\` syntax. Labels with special characters must be quoted.
   - **Attributes:** Use \`[key=value, key2=value2]\` syntax. String values containing special characters must be quoted.
   - **All strings containing special characters must be quoted.** When in doubt, wrap labels and string values in double quotes.
   - This syntax rule applies to ALL node labels, edge labels, and any text content in the diagram.

8. Process
   - Thoroughly scan directories and code to understand responsibilities before diagramming.
   - Validate assumptions against comments, docs, and configuration files.
   - If ambiguity remains, state assumptions explicitly in the summary.

9. Deliverables
   - First, produce an outline listing the components, data stores, external systems, and interactions you plan to depict.
   - Wait for confirmation before generating the final diagram.
   - After confirmation, output:
     - Graphviz DOT diagram code describing the architecture.
     - A legend explaining symbols/notations.
     - A narrative summary covering the dominant architectural pattern, critical data paths, notable design trade-offs, and explicit assumptions.

When you have read the entire codebase dump, respond with the outline. Do not generate the final diagram until the outline has been reviewed and approved.

---

**Codebase Listing:**`;

export function buildArchitecturePromptDot({
  codebaseListing,
}: BuildArchitecturePromptParams): string {
  return `${PROMPT_HEADER}\n\n${codebaseListing}`;
}

export function getArchitecturePromptHeaderDot(): string {
  return PROMPT_HEADER;
}
