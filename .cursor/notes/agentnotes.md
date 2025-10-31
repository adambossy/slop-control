# Agent Notes

- User preferences:
  - Start every reply with a fox emoji.
  - Preserve comments; separate I/O and logic; only add requested functionality.
  - Use Python 3.9+ type hints when writing Python (project is TypeScript).
- Project tech stack: TypeScript + Vite; Mermaid for diagrams; custom diff parser and function extractor.
- Current goal (top priorities):
  1) Public GitHub repo diff ingestion (branches, commit/range selection, no auth).
  2) Architecture diagrams with diff overlays; multi-level context.
  3) Snappy diff UI with interactive navigation and call graph (callers/callees).
- Key modules to examine:
  - `src/lib/diff-parser.ts`, `src/lib/function-extractor.ts`, `src/lib/diagram-generator.ts`
  - UI: `src/components/diagram-renderer.ts`, `src/components/diff-viewer.ts`
- Conventions:
  - Keep files < 500 LOC; small, focused functions; clear naming.
  - Separate data fetching/adapters from parsing/logic and from UI.
- Notes for future sessions:
  - We'll add a `githubAdapter` to fetch public diffs via REST `compare` endpoint.
  - We'll add a dependency graph builder using TS compiler API to power diagrams + call graph.
  - Rate limits without auth: plan caching and backoff.
- Latest stable checkpoint: main branch clean at session start; no local changes.
