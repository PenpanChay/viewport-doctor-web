/**
 * Shared shapes used across the detection engine (checks.ts), the scan
 * orchestrator (scanViewport.ts), the fix-suggestion generator
 * (suggestFixes.ts), and the fix-preview verifier (previewFix.ts) - kept in
 * one place so the API routes and the frontend (app/page.tsx) share a
 * single source of truth instead of re-declaring the same object shapes in
 * every file that touches them.
 */

import type { Browser, BrowserContext } from 'playwright';

// Derived from Browser['newContext'] rather than hand-declared, so this
// stays byte-for-byte compatible with whatever shape the installed
// Playwright version actually accepts (cookies[] + origins[], or a file
// path string) without duplicating that shape here.
export type StorageState = NonNullable<Parameters<Browser['newContext']>[0]>['storageState'];

// Derived from BrowserContext['storageState'] instead - its return value is
// always the parsed { cookies, origins } object, never the file-path-string
// form `StorageState` above also has to allow as an *input* shape. Used by
// lib/loginStorageState.ts (whose whole job is calling context.storageState()
// and handing the result back), so callers get the real, narrower shape -
// a plain object with real cookies/origins arrays - instead of having to
// re-narrow the broader `StorageState` union every time.
export type StorageStateData = Awaited<ReturnType<BrowserContext['storageState']>>;

// Playwright's storageState (StorageState/StorageStateData above) only ever
// covers cookies + localStorage - sessionStorage is entirely out of scope
// for it, with no built-in capture or replay mechanism at all. A site that
// keeps any part of its client-side session in sessionStorage rather than
// localStorage will silently lose that piece on every storageState-based
// replay: captured fine, looks complete, but the site's own JS finds
// nothing there on the next load. See lib/sessionStorageState.ts for how
// this gets captured (right after login, alongside the real storageState -
// lib/loginStorageState.ts) and replayed (via context.addInitScript() into
// a scan - lib/scanViewport.ts), since neither operation is something
// Playwright's own storageState API can do.
export interface SessionStorageEntry {
  name: string;
  value: string;
}

export interface SessionStorageOriginState {
  origin: string;
  sessionStorage: SessionStorageEntry[];
}

// One entry per distinct origin sessionStorage was captured from - usually
// just the one origin a login/scan target lives on, but kept as an array
// (mirroring StorageStateData's own origins[]) rather than a single flat
// object in case a caller's flow spans more than one origin.
export type SessionStorageState = SessionStorageOriginState[];

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
  // Full-page screenshot with every issue's highlight box + badge drawn on
  // it - used for the "see everything at once" overview.
  screenshot: string;
  // Same full-page screenshot with NO overlay drawn - used as the crop
  // source for a single issue's closeup (see app/page.tsx's IssueCrop), so
  // cropping around one issue never pulls in a neighboring issue's
  // box/badge the way cropping `screenshot` would on a dense page. Equal
  // to `screenshot` (same string) when there were no issues to draw.
  cleanScreenshot: string;
  // Page scroll offset at the moment these screenshots were taken -
  // `Issue.rect` is viewport-relative (getBoundingClientRect), so a
  // consumer that wants to crop a region out of either screenshot around a
  // specific issue needs to add these back in to land on the same
  // page-absolute pixel drawOverlayInBrowser used.
  scrollX: number;
  scrollY: number;
  navigationError?: string;
}

export interface ScanResultPerViewport extends ViewportRequest {
  issues: Issue[];
  screenshot: string;
  cleanScreenshot: string;
  scrollX: number;
  scrollY: number;
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

export interface ViewportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  icon: string;
  category: string;
}
