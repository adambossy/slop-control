# Spec: Architecture Diagrams with Diff Overlays

## Goals
- Generate a project architecture diagram dynamically.
- Overlay diffs at appropriate granularity (module/file/function).
- Provide focus+context views to keep big picture while zooming into changes.

## Graph Model
- Nodes: modules (dirs), files, functions/classes.
- Edges: import dependencies (module↔module, file↔file), call edges (function↔function).
- Build using TS Compiler API to extract imports and symbol references.

## Diagram Strategy (Mermaid)
- Base: Mermaid `flowchart` with `subgraph` per top-level package/folder.
- Levels:
  1) Module level (folders) for high-level overview.
  2) File level within selected module.
  3) Function level within selected file.
- Smooth transitions by reusing layout hints and node IDs.

## Diff Overlay
- Map changed files/functions to nodes; style updates:
  - Added: green border
  - Modified: yellow glow
  - Deleted: strikethrough placeholder or dimmed ghost
- Highlight affected edges; show N-hop neighbors for context.

## Interactions
- Click node -> filter diffs to that scope.
- Hover edge -> show import/call summary.
- Toggle levels; breadcrumbs for navigation.

## Performance
- Precompute graphs in a web worker; keep separate caches per level.
- Incremental updates when switching ranges/scopes.

## Testing
- Unit: graph builders (imports, symbol map, overlay mapping).
- Integration: click-through between diagram and diff list.
