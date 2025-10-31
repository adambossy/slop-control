# Project Checklist

## GitHub Diff Ingestion (Public, No Auth)
- [ ] Add `githubAdapter` for branches, commits, compare
- [ ] UI: repo input (owner/repo), branch dropdown, commit/range picker
- [ ] Integrate `compare` diff into existing `diff-parser`
- [ ] Caching + rate limit handling (60/hr unauthenticated)
- [ ] Fixtures for tests (recorded JSON diffs)

## Architecture Diagrams with Diff Overlays
- [ ] Build module/dependency graph from TS imports
- [ ] Group into hierarchy (packages/subgraphs); choose diagram levels
- [ ] Overlay diffs (changed nodes/edges; focus+context hops)
- [ ] Interactions: click node -> filter diffs; sync selection

## Snappy Diff UI + Call Graph
- [ ] Virtualize diff list; incremental rendering
- [ ] Web worker for parsing and graph building
- [ ] Call graph (callers/callees) via TS analysis
- [ ] UI: side panel tree; keyboard nav; deep linkable selections

## Quality & Ops
- [ ] Unit tests (adapters, parsers, graph builders)
- [ ] Integration tests (diagram↔diff interactions)
- [ ] Feature tests (E2E happy path)
- [ ] Docs kept up-to-date in `.cursor/docs`

## Review Notes / Debt
- [ ] Document rate limiting fallback plan
- [ ] Evaluate caching store (in-memory + IndexedDB)
