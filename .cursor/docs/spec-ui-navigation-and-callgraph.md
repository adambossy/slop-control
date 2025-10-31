# Spec: UI Navigation, Diff Snappiness, and Call Graph

## Layout
- Left: Diagram panel (levels with overlays)
- Center: Diff list/viewer (virtualized)
- Right: Explorer + Call graph panel (toggleable)
- Global: Source selector (Local | GitHub), repo/branch/commit controls

## Interactions
- Click diagram node -> filter diff list to scope; auto-scroll to first change.
- Click diff file/function -> select node in diagram; open call graph.
- Keyboard: j/k navigate diff items; [ and ] change scope; g to focus graph.

## Call Graph
- For selected function/symbol: show callers (upstream) and callees (downstream).
- Expandable trees with depths; quick jump to definitions.
- Built from static analysis; cache results per file.

## Performance
- Virtualize central diff list; chunk rendering.
- Offload parsing and graph build to web workers.
- Debounce filter/search; memoize graph to Mermaid conversion.

## States
- Empty / Loading / Error boundaries; retry actions.
- Linkable state (URL params) for repo, branch, range, selection.

## Testing
- Integration tests for selection sync and keyboard navigation.
- Performance assertions (render counts) in headless tests where feasible.
