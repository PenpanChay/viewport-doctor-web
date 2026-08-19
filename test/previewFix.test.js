import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { previewFix, evaluatePreview } from '../lib/previewFix.js';
import { buildFixSuggestions } from '../lib/suggestFixes.js';
import { startNextServer } from '../lib/nextServer.js';
import { scanViewport } from '../lib/scanViewport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const MOBILE = { width: 390, height: 844 };

function issue(check, selector, severity) {
  return { check, selector, severity };
}

describe('evaluatePreview (pure comparison logic, no browser needed)', () => {
  it('reports "resolved" when no matching issue remains after the fix', () => {
    const result = evaluatePreview({
      before: [issue('clipped-element', 'button.publish', 20)],
      after: [],
      check: 'clipped-element',
      selector: 'button.publish',
      elementVaries: false,
    });
    expect(result.verdict).toBe('resolved');
    expect(result.after).toEqual([]);
  });

  it('reports "improved" when the bug is still present but its severity dropped', () => {
    // Mirrors the real horizontal-overflow scenario: fixing the outermost
    // culprit shrinks the overflow but a deeper element still pokes out.
    const result = evaluatePreview({
      before: [issue('horizontal-overflow', null, 237)],
      after: [issue('horizontal-overflow', null, 41)],
      check: 'horizontal-overflow',
      selector: null,
      elementVaries: true,
    });
    expect(result.verdict).toBe('improved');
    expect(result.beforeSeverity).toBe(237);
    expect(result.afterSeverity).toBe(41);
  });

  it('reports "unresolved" when severity is unchanged', () => {
    const result = evaluatePreview({
      before: [issue('text-overflow', 'p.label', 30)],
      after: [issue('text-overflow', 'p.label', 30)],
      check: 'text-overflow',
      selector: 'p.label',
      elementVaries: false,
    });
    expect(result.verdict).toBe('unresolved');
  });

  it('reports "worse" when severity increased - a real regression, not just a non-fix', () => {
    const result = evaluatePreview({
      before: [issue('overlapping-elements', 'button.cta', 40)],
      after: [issue('overlapping-elements', 'button.cta', 90)],
      check: 'overlapping-elements',
      selector: 'button.cta',
      elementVaries: false,
    });
    expect(result.verdict).toBe('worse');
  });

  it('reports "unknown" when the bug was not even present before (nothing to compare)', () => {
    const result = evaluatePreview({
      before: [],
      after: [],
      check: 'oversized-modal',
      selector: 'div.modal',
      elementVaries: false,
    });
    expect(result.verdict).toBe('unknown');
  });

  it('takes the worst severity when a bug matches multiple issues (e.g. several offenders)', () => {
    const result = evaluatePreview({
      before: [issue('horizontal-overflow', null, 100), issue('horizontal-overflow', null, 237)],
      after: [issue('horizontal-overflow', null, 41)],
      check: 'horizontal-overflow',
      selector: null,
      elementVaries: true,
    });
    expect(result.beforeSeverity).toBe(237);
  });
});

describe('previewFix (real browser, real Next.js server, no mocking)', () => {
  let nextServer;
  let baseUrl;
  let browser;

  beforeAll(async () => {
    nextServer = await startNextServer(PROJECT_ROOT);
    baseUrl = `http://localhost:${nextServer.port}`;
    browser = await chromium.launch();
  }, 30000);

  afterAll(async () => {
    await browser.close();
    await nextServer.close();
  });

  it('measures the same issues twice with no CSS injected (a no-op preview changes nothing)', async () => {
    const { before, after } = await previewFix(browser, `${baseUrl}/demo`, MOBILE, '');
    const beforeChecks = before.map((i) => i.check).sort();
    const afterChecks = after.map((i) => i.check).sort();
    expect(afterChecks).toEqual(beforeChecks);
  }, 20000);

  it('actually shrinks the real horizontal-overflow bug on /demo/edge-cases when the real generated fixCode is injected', async () => {
    // End-to-end: scan the real edge-cases page (the 500px-wide image
    // there is what now causes horizontal-overflow, since /demo's own
    // oversized dialog is scoped to its own scrollable card and no
    // longer pushes the whole page wider - see app/demo/page.tsx), take
    // the REAL fixCode this project generates for it, inject that exact
    // CSS into a fresh load of the same page, and confirm the overflow
    // genuinely goes down - not a hand-written "good" CSS snippet, the
    // actual string a user would copy-paste.
    const { issues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const suggestions = buildFixSuggestions({
      viewports: [{ label: 'Mobile', width: MOBILE.width, height: MOBILE.height, issues }],
    });
    const overflowFix = suggestions.find((s) => s.check === 'horizontal-overflow');
    expect(overflowFix).toBeDefined();

    const { before, after } = await previewFix(browser, `${baseUrl}/demo/edge-cases`, MOBILE, overflowFix.fixCode);
    const evaluation = evaluatePreview({
      before,
      after,
      check: 'horizontal-overflow',
      selector: null,
      elementVaries: true,
    });

    // Capping the image's width genuinely shrinks the page-level overflow
    // it was causing - verified against real measurements, not asserted
    // by hand.
    expect(['improved', 'resolved']).toContain(evaluation.verdict);
    expect(evaluation.afterSeverity).toBeLessThan(evaluation.beforeSeverity ?? Infinity);
  }, 20000);

  it.each(['text-overflow', 'overflowing-image', 'overlapping-elements'])(
    'resolves a real %s bug on the demo page when the real generated fixCode is injected',
    async (check) => {
      // All 3 of /demo v2's bugs are genuinely fixable by the tool's own
      // generated CSS, not just detectable - each of these, end to end:
      // scan the real page, take the REAL fixCode this project generates
      // for the flagged element, inject that exact CSS into a fresh load
      // of the same page, and confirm the bug is actually gone - not a
      // hand-written "good" CSS snippet, the actual string a user would
      // copy-paste.
      //
      // overlapping-elements here is a 4-way same-grid-cell collision (see
      // app/demo/page.tsx's stat-strip comment) - the tool's OLD generic
      // fix for this check (`margin-top: 8px`) genuinely does not resolve
      // that kind of collision (two grid items both stretch to fill
      // whatever cell they share, margin or not - confirmed empirically
      // during review). Rather than ship a fix suggestion that doesn't
      // work, lib/checks.js and lib/suggestFixes.js were extended to
      // recognize this specific structural cause (two elements resolving
      // to the same explicit grid-column-start/grid-row-start) and suggest
      // `grid-column-start` instead - which, unlike margin, actually moves
      // the flagged tile to its own column. buildFixSuggestions() groups
      // raw issues by (check, selector), and with 4 tiles fully
      // coinciding there are 3 such groups (see
      // test/scanViewport.test.js) - `find()` below picks up the first one
      // (the "3 / Bugs on this page" tile vs. the other 3), which resolves
      // fully once that one tile gets its own grid-column-start.
      const { issues } = await scanViewport(browser, `${baseUrl}/demo`, MOBILE);
      const suggestions = buildFixSuggestions({
        viewports: [{ label: 'Mobile', width: MOBILE.width, height: MOBILE.height, issues }],
      });
      const fix = suggestions.find((s) => s.check === check);
      expect(fix).toBeDefined();

      const { before, after } = await previewFix(browser, `${baseUrl}/demo`, MOBILE, fix.fixCode);
      const evaluation = evaluatePreview({
        before,
        after,
        check,
        selector: fix.selector,
        elementVaries: fix.elementVaries,
      });
      expect(evaluation.verdict).toBe('resolved');
    },
    20000
  );

  it('rejects an unpreviewable check before ever opening a browser (broken-image has no CSS fix)', async () => {
    // This is enforced at the API route layer (see app/api/preview-fix),
    // not inside previewFix() itself - previewFix() will happily inject
    // any string. Covered here as a reminder of where that guard lives.
    const { NOT_PREVIEWABLE_CHECKS } = await import('../lib/previewFix.js');
    expect(NOT_PREVIEWABLE_CHECKS.has('broken-image')).toBe(true);
  });

  it('also rejects missing-viewport-meta (an HTML tag, not a stylesheet rule) and low-contrast-text (its fixCode is an intentional placeholder)', async () => {
    const { NOT_PREVIEWABLE_CHECKS } = await import('../lib/previewFix.js');
    expect(NOT_PREVIEWABLE_CHECKS.has('missing-viewport-meta')).toBe(true);
    expect(NOT_PREVIEWABLE_CHECKS.has('low-contrast-text')).toBe(true);
    // Every OTHER new check from this round DOES have real, injectable CSS
    // and must stay previewable.
    expect(NOT_PREVIEWABLE_CHECKS.has('tiny-tap-target')).toBe(false);
    expect(NOT_PREVIEWABLE_CHECKS.has('cramped-tap-targets')).toBe(false);
    expect(NOT_PREVIEWABLE_CHECKS.has('tiny-text')).toBe(false);
    expect(NOT_PREVIEWABLE_CHECKS.has('distorted-image')).toBe(false);
  });

  it('actually shrinks a real tiny-tap-target bug on /demo/edge-cases when the real generated fixCode is injected', async () => {
    const { issues: before } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const issue = before.find((i) => i.check === 'tiny-tap-target');
    expect(issue).toBeDefined();

    const [fix] = buildFixSuggestions({
      viewports: [{ label: 'Mobile', width: MOBILE.width, height: MOBILE.height, issues: [issue] }],
    });
    expect(fix.check).toBe('tiny-tap-target');

    const { before: beforeIssues, after } = await previewFix(browser, `${baseUrl}/demo/edge-cases`, MOBILE, fix.fixCode);
    const evaluation = evaluatePreview({
      before: beforeIssues,
      after,
      check: fix.check,
      selector: fix.selector,
      elementVaries: fix.elementVaries,
    });
    expect(evaluation.verdict).toBe('resolved');
  }, 20000);

  it('actually fixes the aspect ratio of a real distorted-image bug on /demo/edge-cases when the real generated fixCode is injected', async () => {
    const { issues: before } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const issue = before.find((i) => i.check === 'distorted-image');
    expect(issue).toBeDefined();

    const [fix] = buildFixSuggestions({
      viewports: [{ label: 'Mobile', width: MOBILE.width, height: MOBILE.height, issues: [issue] }],
    });
    expect(fix.check).toBe('distorted-image');

    const { before: beforeIssues, after } = await previewFix(browser, `${baseUrl}/demo/edge-cases`, MOBILE, fix.fixCode);
    const evaluation = evaluatePreview({
      before: beforeIssues,
      after,
      check: fix.check,
      selector: fix.selector,
      elementVaries: fix.elementVaries,
    });
    expect(evaluation.verdict).toBe('resolved');
  }, 20000);
});
