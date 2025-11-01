<!-- c16b06bc-2807-4a43-9b82-570f34d1cce0 c93a0887-5d20-4952-87c0-d998e841d8d1 -->
# GitHub Diff Ingestion Requirements Plan

## Core Functionality

### 1. Repository Selection

- Accept owner and repository name as user input
- Validate repository format and accessibility
- Support public repositories only (no authentication required)

### 2. Branch Management

- Fetch and display list of available branches for a repository
- Allow user to select a target branch
- Support pagination for repositories with many branches (100+ branches)

### 3. Commit Selection

- Fetch and display commits for the selected branch
- Support two selection modes:
- Single commit comparison (commit vs its parent)
- Commit range comparison (base vs head)
- Provide search capability for commits
- Display recent commits list
- Support pagination for commit history

### 4. Diff Retrieval

- Fetch diff data between selected commits
- Normalize diff data to match existing internal data format
- Support both single commit and commit range diffs
- Optionally fetch raw file contents when needed

### 5. Source Mode Selection

- Provide toggle between local file upload and GitHub fetch modes
- Maintain separate state for each source mode
- Preserve existing local upload functionality

## Data Requirements

### API Interactions

Must interact with GitHub REST API v3:

- List branches with pagination
- List commits for a specific branch with pagination
- Compare two commits (base and head)
- Fetch raw file content at specific commit reference

### Data Normalization

- Transform GitHub API responses into application's internal diff format
- Preserve raw API responses for debugging purposes
- Ensure compatibility with existing diff parser and diagram generator

## Caching Strategy

### Cache Keys

- Use stable, versioned keys to prevent schema collisions
- Include namespace prefix for all cached resources
- Key components: resource type, repository identifier, commit references, file paths
- Examples of cached resources:
- Branch lists for a repository
- Commit lists for a branch
- Commit comparisons (diffs)
- Raw file contents

### Cache Tiers

- Memory cache: Fast access, cleared on application restart, limited size (LRU eviction)
- Persistent cache: Survives application restarts, larger capacity with LRU pruning

### Cache Policy

- Use prefer-cache-revalidate strategy:
- Return cached value immediately if available
- Revalidate with conditional request in background
- Update cache on fresh data
- Keep cache on 304 Not Modified response
- Differentiate between immutable and mutable resources:
- Immutable (SHA-based): Long TTL, skip revalidation
- Mutable (branch lists, recent commits): Short TTL (2-5 minutes), require revalidation

### Cache Entry Metadata

Store with each cached item:

- Data payload
- ETag for conditional requests
- Last-Modified header value
- Creation timestamp
- Time-to-live for mutable resources
- Original request URL and parameters
- Schema version identifier
- Size information

## Rate Limit Handling

### Constraints

- Unauthenticated requests limited to ~60 per hour per IP address
- Must track remaining rate limit from API responses
- Must track reset time for rate limit window

### Mitigation Strategies

- Aggressive caching of all responses
- Batch requests where possible
- Prefer single comparison API call over multiple per-file calls
- When rate limit is low, serve stale cache entries for non-critical refreshes
- Display rate limit status to user

### Error Handling

- Detect rate limit exhaustion (429 response)
- Show countdown timer until rate limit reset
- Allow user to continue with cached data during rate limit
- Option to provide personal access token for higher limits (future enhancement, not initial version)

## User Interface Requirements

### Input Controls

- Text field for repository (owner/repo format) with validation
- Dropdown for branch selection populated from API
- Commit picker with:
- Search functionality
- List of recent commits
- Base commit selector
- Head commit selector
- Radio or toggle for source selection (Local vs GitHub)

### Feedback and Status

- Loading indicators during API requests
- Display whether data is from cache or fresh
- Show current rate limit status
- Display friendly messages for:
- Empty repositories
- No changes in selected range
- Rate limit exhaustion with countdown
- Network connectivity issues
- Invalid repository or access denied

### Error States

- Empty repository: Display helpful message about selecting valid repository
- No changes in range: Indicate selected commits have no diff
- Rate limited: Show reset timer and option to use cached data
- Network errors: Retry with exponential backoff, fall back to offline cache when available
- Invalid input: Provide inline validation feedback

## Integration Requirements

### Existing System Compatibility

- Output normalized diffs in same format as local file upload
- Feed diffs to existing diff parser without modification
- Ensure diagrams render identically regardless of source (local vs GitHub)
- Maintain all existing diagram functionality

### Configuration

- Configurable User-Agent header for API requests
- Support for ETag-based conditional requests
- Configurable retry behavior with exponential backoff
- Adjustable cache size limits for both tiers

## Interface Specifications

### Cache Key Structure

Components for uniquely identifying cached resources:

- `namespace`: Version-prefixed namespace (e.g., "github:v1")
- `resource`: Type of resource ("branches", "commits", "compare", "raw")
- `owner`: Repository owner
- `repo`: Repository name
- `branch`: Branch name (optional, for commits list)
- `sha`: Commit SHA (optional, for single commit alias)
- `base`: Base commit SHA (optional, for compare)
- `head`: Head commit SHA (optional, for compare)
- `ref`: Reference or SHA (optional, for raw file)
- `path`: File path (optional, for raw file)

### Cache Entry Structure

Each cached item contains:

- `data`: The actual cached payload (type varies by resource)
- `meta`: Metadata object containing:
- `etag`: ETag header value for conditional requests (optional)
- `lastModified`: Last-Modified header value (optional)
- `createdAt`: Timestamp in milliseconds since epoch
- `ttlMs`: Time-to-live in milliseconds for mutable resources (optional)
- `url`: Original request URL (optional)
- `params`: Request parameters as key-value pairs (optional)
- `schemaVersion`: Schema version identifier (e.g., "v1")
- `sizeBytes`: Size of cached data in bytes (optional)

### Cache Interface

Methods required for cache implementation:

- `get(key)`: Retrieve cached entry by key, returns entry or null
- `set(key, entry)`: Store entry with given key
- `has(key)`: Check if key exists in cache
- `invalidate(key)`: Remove specific cached entry
- `clearNamespace(namespace)`: Remove all entries in a namespace

### GitHub Client Interface

Public methods for interacting with GitHub API:

**listBranches**

- Input parameters:
- `owner`: Repository owner (required)
- `repo`: Repository name (required)
- `per_page`: Results per page (optional, default implementation-specific)
- Returns:
- `branches`: Array of branch objects, each containing:
- `name`: Branch name
- `commitSha`: Latest commit SHA on branch
- `fromCache`: Boolean indicating if result came from cache

**listCommits**

- Input parameters:
- `owner`: Repository owner (required)
- `repo`: Repository name (required)
- `sha`: Branch name or commit SHA (required)
- `per_page`: Results per page (optional, default implementation-specific)
- Returns:
- `commits`: Array of commit objects, each containing:
- `sha`: Commit SHA
- `message`: Commit message
- `author`: Author name (optional)
- `fromCache`: Boolean indicating if result came from cache

**compare**

- Input parameters:
- `owner`: Repository owner (required)
- `repo`: Repository name (required)
- `base`: Base commit SHA (required)
- `head`: Head commit SHA (required)
- Returns:
- `diff`: Normalized diff object in application's internal format
- `fromCache`: Boolean indicating if result came from cache

**getRaw**

- Input parameters:
- `owner`: Repository owner (required)
- `repo`: Repository name (required)
- `ref`: Branch name or commit SHA (required)
- `path`: File path within repository (required)
- Returns:
- `content`: Raw file content as string
- `fromCache`: Boolean indicating if result came from cache

### Storage Behavior Specification

- Single commit diff: Store as immutable compare entry keyed by `parentSha...commitSha` (client resolves parent SHA once)
- Commit range diff: Store as immutable compare entry keyed by `baseSha...headSha`
- All SHA-based comparisons are treated as immutable
- Future optimization: per-file index (not required for initial version)

## Testing Requirements

### Recorded Fixtures

- Capture sample API responses for branches endpoint
- Capture sample API responses for commits endpoint
- Capture sample API responses for compare endpoint
- Include various scenarios: empty repo, single commit, large range, binary files

### Unit Testing

- Validate data normalization from GitHub format to internal format
- Test cache key generation
- Test cache eviction logic (LRU)
- Test TTL expiration logic
- Test rate limit tracking

### Integration Testing

- Load a commit range from GitHub
- Verify diff renders correctly in existing viewer
- Verify diagrams generate correctly
- Compare output to equivalent local file upload
- Test cache hit/miss scenarios
- Test rate limit behavior with mock responses

### End-to-End Scenarios

- Complete flow: enter repo → select branch → select commits → view diff → generate diagrams
- Cache persistence across application restarts
- Graceful degradation when rate limited
- Recovery from network interruptions

## Future Considerations (Out of Scope)

- Authentication support for private repositories
- Higher rate limits via personal access token
- Webhook integration for automatic updates
- Multi-repository comparison
- Pull request diff viewing

### To-dos

- [ ] Implement repository and branch selection UI with validation
- [ ] Build commit picker with search and range selection
- [ ] Create API client for GitHub REST v3 endpoints (branches, commits, compare, raw)
- [ ] Implement normalization layer to convert GitHub API responses to internal diff format
- [ ] Build two-tier cache system (memory + persistent) with versioned keys and LRU eviction
- [ ] Implement prefer-cache-revalidate policy with ETag support and TTL handling
- [ ] Add rate limit tracking and user feedback with countdown timers
- [ ] Implement comprehensive error handling for network, rate limit, and validation errors
- [ ] Add UI toggle between local upload and GitHub fetch modes
- [ ] Create test fixtures and verify GitHub diffs render identically to local uploads