<!-- 7b1ad70c-40c3-4457-8431-ab45daeba120 bbbe419a-3a13-4ae6-a5f9-19af6646b411 -->

# GitHub Diff Selector Component Specification

## Overview

A multi-step form component for selecting GitHub repository diffs via public API (unauthenticated). Users specify a repo, select a branch, then choose commits (single or range) to generate a diff comparison.

## Component Structure

### Layout

Three horizontal rows with consistent vertical spacing (20px gap):

1. **Repo Row**: Owner/Repo input field + Load Repo button
2. **Diff Selection Row**: Branch dropdown + Base dropdown + Head dropdown + Load Diff button
3. No status text row (removed; feedback is inline)

### Field Components

Each input/dropdown is wrapped in a `.field` container with:

- Floating label positioned at `top: -8px`, bisecting the top border
- Label has white background with padding to cut through border
- Label color: `#6b7280` default, `#111827` on focus
- Field container uses `position: relative` and `overflow: visible`

### Input/Dropdown Styling

- Height: 44px (fixed via `min-height` and `max-height`)
- Padding: 10px 12px
- Border: 1px solid `#d1d5db`
- Border radius: 6px
- Font size: 14px
- Active background: `#fff`, text: `#111827`
- Disabled background: `#f9fafb`, text: `#9ca3af`
- Text truncates with ellipsis when too long (no wrapping, no height change)

### Buttons

- Fixed width: 120px (`flex-shrink: 0`)
- Background: `#111827`, text: white
- Border radius: 6px
- Padding: 10px 14px
- Disabled opacity: 0.5
- Vertically center-aligned with adjacent input/dropdown (ignoring floating labels)

### Row Alignment

- **Repo Row**: `display: flex`, `align-items: center`, `gap: 12px`
- Input field uses `flex: 1` (grows to fill space)
- Button is fixed width
- **Diff Selection Row**: `display: flex`, `align-items: center`, `gap: 16px`
- Three dropdown fields each use `flex: 1` (equal thirds of remaining space)
- Button is fixed width
- Left edge of first dropdown aligns with left edge of Load Repo button
- Right edge of Load Diff button aligns with right edge of Load Repo button

## Data Flow

### Step 1: Load Repository

**Input**: `owner/repo` text field (e.g., "octocat/Hello-World")
**Action**: User clicks "Load Repo" or presses Enter in the field
**API Call**: `GET /repos/{owner}/{repo}/branches` (unauthenticated)
**Response Processing**:

- Parse branch list
- Update Branch dropdown placeholder to "Select from {N} branches"
- Populate Branch dropdown with branch names
- Enable Branch dropdown
- Show loading spinner inside Branch dropdown during fetch

### Step 2: Select Branch & Load Commits

**Input**: User selects a branch from dropdown
**Action**: Selection triggers automatic commit load
**API Call**: `GET /repos/{owner}/{repo}/commits?sha={branch}&per_page=100`
**Response Processing**:

- Parse commit list (SHA + message)
- Update Base dropdown placeholder to "Select base from {N} commits"
- Update Head dropdown placeholder to "(Optional) Select head from {N} commits"
- Populate Base dropdown with commits (oldest first)
- Populate Head dropdown with commits (newest first)
- Enable Base and Head dropdowns
- Enable Load Diff button
- Show loading spinners inside Base and Head dropdowns during fetch

### Step 3: Select Commits & Load Diff

**Inputs**:

- Base commit (required): Older commit in range
- Head commit (optional): Newer commit in range

**Modes**:

1. **Single Commit Mode** (Head is empty):

- Resolve parent of Base commit via `GET /repos/{owner}/{repo}/commits/{sha}`
- Compare parent...base

2. **Range Mode** (Head is selected):

- Validate: Head must be newer than Base (via commit order in list)
- Compare base...head

**API Call**: `GET /repos/{owner}/{repo}/compare/{base}...{head}`
**Output**: Emit comparison data to parent application

## Interactive Behaviors

### Loading States

- No external status text; all feedback is inline
- Loading indicator: Animated spinner (16px, right-aligned at `right: 40px`)
- Spinner CSS:
- Border: 2px solid `#e5e7eb`, top color: `#6366f1`
- Animation: 0.6s linear infinite rotation
- Positioned via `::after` pseudo-element on `.field-loading .choices__inner`
- Spinner appears during:
- Branch loading (on Branch field)
- Commit loading (on Base and Head fields simultaneously)

### Floating Labels

- Labels are always visible at top position (no animation)
- Label position: Absolute, `left: 12px`, `top: -8px`
- Label background cuts through border (white background with 6px horizontal padding)
- Label color changes on focus: gray → dark gray
- Z-index: 10 (ensures visibility above dropdown menus)

### Dropdown Behavior

- Search enabled within dropdown lists
- Dropdown menu width matches parent field width exactly
- Dropdown items truncate with ellipsis (no wrapping)
- Placeholders update dynamically to show counts after data loads
- Empty Head dropdown defaults to single-commit mode

### Validation

- Repo input: Must parse as "owner/repo" format
- Base selection: Required before Load Diff
- Head validation: Must be chronologically after Base (if selected)
- Error handling: Log to console, do not show UI errors

### Keyboard Interactions

- Enter key in Owner/Repo field triggers "Load Repo"
- Standard dropdown navigation (arrow keys, type-to-search)

## State Management

### Component State

- `owner: string` - Repository owner
- `repo: string` - Repository name
- `branches: Array<{name: string, commitSha: string}>` - Available branches
- `commits: Array<{sha: string, message: string, date: string, author: string}>` - Commits for selected branch
- `selectedBranch: string | null` - Currently selected branch
- `selectedBase: string | null` - Selected base commit SHA
- `selectedHead: string | null` - Selected head commit SHA (null = single-commit mode)
- `isLoadingBranches: boolean` - Loading state for branch fetch
- `isLoadingCommits: boolean` - Loading state for commit fetch

### Enabled/Disabled States

- **Initial**: All dropdowns disabled, Load Diff disabled
- **After Load Repo**: Branch enabled, Load Diff still disabled
- **After Branch Selection**: Base and Head enabled, Load Diff enabled
- **Disabled styling**: Light gray background, gray text

### Data Persistence

- Component is ephemeral; no persistence across page reloads
- Each field clears when its dependency changes:
- Changing repo clears branch/base/head
- Changing branch clears base/head

## API Integration

### Rate Limits

- Unauthenticated: ~60 requests/hour per IP
- No built-in rate limit handling in component (handled by consuming application)
- Future: Optional auth token parameter

### Error Handling

- Network errors: Log to console, remove loading spinner
- Invalid repo: Silent failure (no error UI)
- No parent commit: Log error, halt single-commit mode
- Invalid chronology (head before base): Log error, prevent submission

### Response Normalization

- Branch list: Extract `name` and `commit.sha` from each branch object
- Commit list: Extract `sha`, `commit.message` (first line only), `commit.author.date`, `commit.author.name`
- Parent resolution: Extract `parents[0].sha` from commit detail

## Styling Requirements

### Color Palette

- Primary text: `#111827`
- Secondary text: `#6b7280`
- Disabled text: `#9ca3af`
- Border: `#d1d5db`
- Background: `#fff`
- Disabled background: `#f9fafb`
- Accent (focus/spinner): `#6366f1`
- Border accent light: `#e5e7eb`

### Typography

- Font family: System UI font stack (sans-serif)
- Input/dropdown text: 14px
- Label text: 11px (when floating)
- Button text: 14px

### Spacing

- Vertical gap between rows: 20px
- Horizontal gap within rows: 12px (repo row), 16px (diff row)
- Field internal padding: 10px 12px
- Label padding (horizontal): 6px

### Responsive Behavior

- Dropdowns grow/shrink proportionally (flex: 1)
- Buttons maintain fixed width (120px)
- Minimum field width: None (shrinks with viewport)
- Row wrapping: Only repo row wraps if needed; diff row does not wrap

## Integration Points

### Inputs (Props)

- None required (component is self-contained)
- Optional: `defaultRepo: string` to pre-populate Owner/Repo field
- Optional: `authToken: string` for authenticated requests (future)

### Outputs (Events)

- `onCompareReady(payload)` - Emitted when user clicks Load Diff
- Payload: `{ owner: string, repo: string, base: string, head: string }`
- Note: In single-commit mode, `base` is parent SHA and `head` is selected commit SHA

### Dependencies

- HTTP client for GitHub API
- Searchable dropdown/combobox component (e.g., Choices.js pattern)
- No other external dependencies

## Accessibility

### ARIA

- Floating labels use `for` attribute linking to input IDs
- Buttons are native `<button>` elements
- Loading states: Spinner is decorative (CSS only, no aria-live needed)
- Disabled states: Use native `disabled` attribute

### Keyboard Navigation

- Tab order: Owner/Repo → Load Repo → Branch → Base → Head → Load Diff
- Enter key: Submits in Owner/Repo field, opens dropdown in select fields
- Arrow keys: Navigate dropdown options
- Escape: Closes dropdown

### Focus States

- Focus ring: 3px shadow with accent color
- Label changes color on focus
- Dropdown remains accessible while disabled (visually grayed out)

## Testing Considerations

### Unit Tests

- Repo parsing (owner/repo validation)
- Commit chronology validation (isHeadAfterBase logic)
- SHA shortening (first 7 characters)

### Integration Tests

- Load branches → populate Branch dropdown
- Select branch → load commits → populate Base/Head dropdowns
- Select base (no head) → resolve parent → emit compare payload
- Select base + head → validate chronology → emit compare payload

### Mock Data

- Branch fixture: List of 18 branches
- Commit fixture: List of 100 commits with SHA, message, date, author
- Parent resolution fixture: Commit with parents array

## Future Enhancements (Out of Scope)

- Authentication support (increase rate limits)
- Caching layer (IndexedDB persistence)
- Private repository support
- GraphQL API migration
- Pagination for large commit lists (>100)
- Deep linking (URL state persistence)
