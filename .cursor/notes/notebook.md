# Notebook

- GitHub REST compare endpoint returns per-file patches and status. Good fit for current diff parser with small adapter.
- For call graph, prefer TS Compiler API over regex; can fall back to `ts-morph` for ergonomics.
- Diagram layering: start with module-level (folders) and allow drill-down to files/functions. Use Mermaid `subgraph` for grouping.
- Performance: offload parsing and graph building to a worker; keep main thread for UI.
