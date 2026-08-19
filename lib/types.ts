/**
 * Shared shapes used across the detection engine (checks.ts), the scan
 * orchestrator (scanViewport.ts), the fix-suggestion generator
 * (suggestFixes.ts), the fix-preview verifier (previewFix.ts), and the
 * breakpoint-discovery engine (discoverBreakpoints.ts) - kept in one place
 * so the API routes and the frontend (app/page.tsx) share a single source
 * of truth instead of re-declaring the same object shapes in every file
 * that touches them.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IssueDetailsExtra {
  label: string;
  value: string;
}

// A pre-formatted, check-specific breakdown of exactly what was measured -
// so a UI can render "Expected / Actual / Overflow" fields directly instead
// of regex-scraping them back out of the free-text `message` (fragile, and
// couples the UI's rendering to the exact wording of a human-readable
// sentence). `extra` is an optional array of additional named numeric facts
// a specific check needs beyond the plain three (e.g. cramped-tap-targets
// naming both elements' own widths, not just the gap between them).
export interface IssueDetails {
  expected: string;
  actual: string;
  delta: string | null;
  extra?: IssueDetailsExtra[];
}

export interface Issue {
  check: string;
  message: string;
  selector: string;
  rect: Rect;
  severity: number | null;
  details: IssueDetails | null;
}

export interface RunChecksResult {
  issues: Issue[];
  scrollX: number;
  scrollY: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewportRequest extends ViewportSize {
  label: string;
}

export interface ScanViewportResult {
  url: string;
  viewport: ViewportSize;
  issues: Issue[];
  screenshot: string;
  navigationError?: string;
}

export interface ScanResultPerViewport extends ViewportRequest {
  issues: Issue[];
  screenshot: string;
  navigationError?: string;
}

export interface FixSuggestion {
  check: string;
  selector: string | null;
  message: string;
  elementVaries: boolean;
  brokenViewports: ViewportRequest[];
  okViewports: ViewportRequest[];
  scoped: boolean;
  breakpointHint: string | null;
  suggestion: string;
  fixCode: string;
}

export interface PageScanResult {
  url: string;
  viewports: ScanResultPerViewport[];
  fixSuggestions: FixSuggestion[];
}

export interface ScanAllViewportsResult {
  pages: PageScanResult[];
}

// Only the fields buildFixSuggestions() actually reads from an issue -
// `message`/`selector` always, `rect` only opportunistically (its own code
// defensively checks `issue.rect && ...` before touching it). Deliberately
// narrower than the full `Issue` shape so a real Issue[] (which has every
// field) is still assignable here, but a hand-built test fixture that only
// sets these three fields is too - a real Issue satisfies this structurally
// without a cast, and so does a minimal one built just for a unit test.
export interface FixSuggestionIssue {
  check: string;
  message: string;
  selector: string;
  rect?: Rect;
}

export interface FixSuggestionsViewport {
  label: string;
  width: number;
  height: number;
  issues: FixSuggestionIssue[];
  navigationError?: string;
}

// Only the field buildFixSuggestions() actually reads from a per-page scan
// result - deliberately narrower than PageScanResult so callers don't have
// to fabricate a `url`/`fixSuggestions` just to call it standalone (see
// lib/suggestFixes.ts).
export interface FixSuggestionsInput {
  viewports: FixSuggestionsViewport[];
}

export interface PreviewFixResult {
  before: Issue[];
  after: Issue[];
  navigationError?: string;
  cssError?: string;
}

export type PreviewVerdict = 'resolved' | 'improved' | 'unresolved' | 'worse' | 'unknown';

// Only the fields evaluatePreview()'s comparison logic actually reads -
// `check` and `severity` always, `selector` only when the check isn't
// page-level (`elementVaries`). Narrower than `Issue` for the same reason
// as FixSuggestionIssue above: a real Issue satisfies it as-is, and so does
// a minimal `{check, selector, severity}` fixture built for a unit test.
export interface ComparableIssue {
  check: string;
  selector: string | null;
  severity?: number | null;
}

export interface EvaluatePreviewResult {
  verdict: PreviewVerdict;
  beforeSeverity: number | null;
  afterSeverity: number | null;
  before: ComparableIssue[];
  after: ComparableIssue[];
}

export interface BreakpointBand {
  label: string;
  min: number;
  max: number;
}

export interface StandardBreakpoint {
  width: number;
  band: string;
}

export interface NearestStandardBreakpoint extends StandardBreakpoint {
  dist: number;
}

export interface BreakpointTransition {
  selector: string;
  width: number;
  below: number;
  aboveOrEqual: number;
  expected: boolean;
  nearestStandardBreakpoint: NearestStandardBreakpoint | null;
}

export interface DiscoverBreakpointsResult {
  url: string;
  minWidth: number;
  maxWidth: number;
  bands: BreakpointBand[];
  transitions: BreakpointTransition[];
  navigationError?: string;
}

export interface ViewportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  icon: string;
  category: string;
}
