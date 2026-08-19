import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, type Browser } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scanViewport, scanAllViewports } from '../lib/scanViewport';
import { startNextServer, type NextServerHandle } from '../lib/nextServer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

const MOBILE = { label: 'Mobile', width: 390, height: 844 };
const DESKTOP = { label: 'Desktop', width: 1440, height: 900 };
// The exact breakpoint every bug on /demo v2 is built around (Tailwind's
// `sm:`) - one viewport just below it (still broken) and one right at it
// (already fixed), so the "breaks on phones, fine from Tablet up" premise
// of that page is asserted directly instead of only implied by comparing
// Mobile vs. Desktop.
const JUST_BELOW_SM = { width: 639, height: 844 };
const AT_SM = { width: 640, height: 900 };

describe('scanViewport (real browser, real Next.js server, no mocking)', () => {
  let nextServer: NextServerHandle;
  let baseUrl: string;
  let browser: Browser;

  beforeAll(async () => {
    nextServer = await startNextServer(PROJECT_ROOT);
    baseUrl = `http://localhost:${nextServer.port}`;
    browser = await chromium.launch();
  }, 30000);

  afterAll(async () => {
    await browser.close();
    await nextServer.close();
  });

  it('finds its 3 bug categories on the bundled demo page at a narrow (mobile) viewport', async () => {
    // /demo v2 has 3 bug sections - see app/demo/page.tsx - and all 3 share
    // the same story: fine from Tablet (768px) up, broken below `sm`
    // (640px). overlapping-elements (the quick-stat strip) demonstrates
    // that with all 4 tiles pinned to the same explicit CSS Grid cell
    // below `sm`, each getting its own column back at `sm` and up - so the
    // strip goes from "one crowded pile" on a phone to "4 clean tiles" on
    // a laptop, same shape as this page's other 2 bugs. v1's
    // clipped-element (viewport-independent) now lives on /demo/edge-cases
    // instead, alongside oversized-modal and the tool's other checks
    // (below).
    const { issues, screenshot } = await scanViewport(browser, `${baseUrl}/demo`, MOBILE);
    const checks = issues.map((i) => i.check);

    expect(checks).toContain('overlapping-elements');
    expect(checks).toContain('text-overflow');
    expect(checks).toContain('overflowing-image');
    expect(checks).not.toContain('horizontal-overflow');
    // 4 tiles fully coinciding means the checker's pairwise algorithm
    // genuinely reports one issue per pair - C(4,2) = 6 - plus the other 2
    // bugs' 1 issue each, so 8 total here (still comfortably readable at a
    // glance, just no longer under 5 now that a 4-way collision is part of
    // the page - see app/demo/page.tsx's stat-strip comment for why that's
    // the real, unpadded count rather than an arbitrary cap).
    expect(issues.length).toBe(8);

    expect(screenshot).toMatch(/^data:image\/png;base64,/);
  }, 20000);

  it('still finds the same 3 bugs just below the sm breakpoint (639px)', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo`, JUST_BELOW_SM);
    const checks = issues.map((i) => i.check);

    expect(checks).toContain('overlapping-elements');
    expect(checks).toContain('text-overflow');
    expect(checks).toContain('overflowing-image');
  }, 20000);

  it('clears all 3 viewport-dependent bugs right at the sm breakpoint (640px) and wider', async () => {
    for (const viewport of [AT_SM, DESKTOP]) {
      const { issues } = await scanViewport(browser, `${baseUrl}/demo`, viewport);
      const checks = issues.map((i) => i.check);

      expect(checks).not.toContain('text-overflow');
      expect(checks).not.toContain('overflowing-image');
      expect(checks).not.toContain('horizontal-overflow');
      // Every stat tile gets its own grid column back at `sm` and up (see
      // app/demo/page.tsx), so the 4-way collision clears too - same shape
      // as this page's other 2 bugs.
      expect(checks).not.toContain('overlapping-elements');
    }
  }, 20000);

  it('finds its 9 bug categories on /demo/edge-cases below 1440px, and clears every one at Desktop/Large Desktop', async () => {
    // The checks not (or not only) demonstrated on the main /demo page
    // (see above) - split out to their own page so /demo stays quick to
    // read while every check the tool supports still has a real page to
    // scan and a real test running against it. overlapping-elements
    // appears on both pages now - viewport-dependent on /demo (the
    // stat-strip collision) and here (the "NEW" badge) - deliberately, so
    // both flavors of the same check have real coverage.
    //
    // Unlike v1 of this page, none of this is viewport-independent anymore
    // - every bug here clears specifically at Desktop (1440px) and Large
    // Desktop (1920px), and stays broken at every smaller preset - see
    // this page's own top comment. missing-viewport-meta is the one
    // exception, no longer here at all - see the /demo/broken-meta tests
    // below.
    const { issues: narrowIssues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const narrowChecks = narrowIssues.map((i) => i.check);
    expect(narrowChecks).toContain('overlapping-elements');
    expect(narrowChecks).toContain('text-overflow');
    expect(narrowChecks).toContain('offscreen-element');
    expect(narrowChecks).toContain('fixed-overlap');
    expect(narrowChecks).toContain('overflowing-image');
    expect(narrowChecks).toContain('tiny-tap-target');
    expect(narrowChecks).toContain('cramped-tap-targets');
    expect(narrowChecks).toContain('tiny-text');
    expect(narrowChecks).toContain('low-contrast-text');
    expect(narrowChecks).toContain('distorted-image');
    expect(narrowChecks).toContain('horizontal-overflow');
    // Moved to its own page entirely - see /demo/broken-meta instead.
    expect(narrowChecks).not.toContain('missing-viewport-meta');

    const LARGE_DESKTOP = { width: 1920, height: 1080 };
    for (const viewport of [DESKTOP, LARGE_DESKTOP]) {
      const { issues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, viewport);
      expect(issues).toEqual([]);
    }
  }, 20000);

  it('reports which edge an off-screen element is pushed past and by how much', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const offscreen = issues.find((i) => i.check === 'offscreen-element');
    expect(offscreen).toBeDefined();
    // The "Saved" toast is pinned at `top: -20px` - pushed past the TOP
    // edge specifically, a direction horizontal-overflow can never catch
    // since it only ever measures horizontal scrollWidth.
    expect(offscreen!.message).toMatch(/past the top edge/);
    expect(offscreen!.message).toMatch(/20px/);
  }, 20000);

  it('names both the covering bar and the covered content for fixed-overlap', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const covered = issues.filter((i) => i.check === 'fixed-overlap');
    expect(covered.length).toBeGreaterThan(0);
    covered.forEach((issue) => {
      expect(issue.message).toMatch(/docked to the top/);
      expect(issue.message).toMatch(/Free shipping/); // names the covering bar's own text
    });
  }, 20000);

  it('flags the 18x18px close button as a tiny-tap-target, below the 24px WCAG minimum', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const tiny = issues.find((i) => i.check === 'tiny-tap-target');
    expect(tiny).toBeDefined();
    expect(tiny!.message).toMatch(/18x18px/);
    expect(tiny!.message).toMatch(/24px minimum/);
  }, 20000);

  it('flags the Save/Cancel button pair as cramped-tap-targets, naming the axis and the other button', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const cramped = issues.find((i) => i.check === 'cramped-tap-targets');
    expect(cramped).toBeDefined();
    expect(cramped!.message).toMatch(/horizontally/);
    expect(cramped!.message).toMatch(/8px minimum spacing/);
  }, 20000);

  it('flags the 10px caption as tiny-text, below the 12px legibility minimum', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const tinyText = issues.find((i) => i.check === 'tiny-text');
    expect(tinyText).toBeDefined();
    expect(tinyText!.message).toMatch(/10px/);
    expect(tinyText!.message).toMatch(/12px minimum/);
  }, 20000);

  it('measures the squished banner image as distorted-image with its real natural vs. rendered ratio', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const distorted = issues.find((i) => i.check === 'distorted-image');
    expect(distorted).toBeDefined();
    // Natural 500x120 (~4.17:1) forced into a 300x200 (1.5:1) box.
    expect(distorted!.message).toMatch(/natural size is 500x120/);
    expect(distorted!.message).toMatch(/300x200/);
  }, 20000);

  it('flags /demo/broken-meta\'s deliberately-misconfigured viewport meta tag, naming the bad content, at every viewport', async () => {
    // Split out from /demo/edge-cases onto its own dedicated page - a
    // `<meta name="viewport">` tag's content is static HTML, not CSS, so
    // it can't be made "wrong below 1440px, correct above it" the way
    // every other bug on /demo/edge-cases now is. It stays broken
    // regardless of viewport, checked here at both a narrow and a wide
    // size to confirm that.
    const LARGE_DESKTOP = { width: 1920, height: 1080 };
    for (const viewport of [MOBILE, DESKTOP, LARGE_DESKTOP]) {
      const { issues } = await scanViewport(browser, `${baseUrl}/demo/broken-meta`, viewport);
      const meta = issues.find((i) => i.check === 'missing-viewport-meta');
      expect(meta).toBeDefined();
      // The tag is present but fixed at a desktop width instead of
      // device-width - see this route's own `viewport` export.
      expect(meta!.message).toMatch(/content \("width=1024, initial-scale=1"\)/);
      expect(meta!.message).toMatch(/desktop width/);
      // Page-level, not tied to a specific descendant - blamed on <html>.
      expect(meta!.selector.startsWith('html')).toBe(true);
    }
  }, 20000);

  it('flags the "Saved" toast (white text on teal) as low-contrast-text, below the 4.5:1 AA minimum', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const contrast = issues.find((i) => i.check === 'low-contrast-text');
    expect(contrast).toBeDefined();
    expect(contrast!.message).toMatch(/below the WCAG AA minimum of 4.5:1/);
  }, 20000);

  it('does NOT flag /demo (unlike /demo/broken-meta) for missing-viewport-meta, since Next.js injects a correct one by default', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo`, MOBILE);
    const checks = issues.map((i) => i.check);
    expect(checks).not.toContain('missing-viewport-meta');
  }, 20000);

  it('reports a navigationError instead of throwing when the page cannot be reached', async () => {
    const result = await scanViewport(browser, `${baseUrl}/this-route-does-not-exist-either`, MOBILE, {
      timeoutMs: 5000,
    });
    // A 404 still navigates successfully (it's a real, if unhappy, page) -
    // use an unroutable port instead to force an actual navigation failure.
    expect(result.issues).toBeDefined();

    const unreachable = await scanViewport(browser, 'http://127.0.0.1:1/', MOBILE, { timeoutMs: 3000 });
    expect(unreachable.navigationError).toBeTruthy();
    expect(unreachable.issues).toEqual([]);
  }, 15000);

  it('names the real structural cause of horizontal-overflow instead of a coarse ancestor or coincidental text', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE);
    const overflowIssues = issues.filter((i) => i.check === 'horizontal-overflow');
    expect(overflowIssues.length).toBeGreaterThan(0);

    // The 500px-wide image is the real, fixable cause of the page being
    // wider than the 390px mobile viewport - it must be named specifically,
    // not crowded out by the fact that other elements (a heading, a
    // paragraph) coincidentally share a similar width for unrelated
    // reasons, and not hidden behind a coarse ancestor (<main>, <body>)
    // whose own box doesn't necessarily extend as far right as a
    // descendant that overflows it via ordinary visible overflow.
    expect(overflowIssues.some((i) => i.selector.startsWith('img'))).toBe(true);
    overflowIssues.forEach((issue) => {
      const tag = issue.selector.split(/[.#\s(]/)[0];
      expect(['main', 'body', 'html']).not.toContain(tag);
    });
  }, 20000);

  it('every issue carries a selector, a message, and a rect', async () => {
    const { issues } = await scanViewport(browser, `${baseUrl}/demo`, MOBILE);
    expect(issues.length).toBeGreaterThan(0);
    issues.forEach((issue) => {
      expect(typeof issue.check).toBe('string');
      expect(typeof issue.message).toBe('string');
      expect(typeof issue.selector).toBe('string');
      expect(issue.rect).toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      });
    });
  }, 20000);

  it('every issue also carries a structured `details` breakdown (expected/actual/delta), not just prose', async () => {
    // The Issue Detail card (app/page.tsx) renders Expected/Actual/Overflow
    // fields directly from this object instead of regex-scraping the
    // human-readable `message` - every check must supply one.
    const [demo, edgeCases] = await Promise.all([
      scanViewport(browser, `${baseUrl}/demo`, MOBILE),
      scanViewport(browser, `${baseUrl}/demo/edge-cases`, MOBILE),
    ]);
    const issues = [...demo.issues, ...edgeCases.issues];
    expect(issues.length).toBeGreaterThan(0);
    issues.forEach((issue) => {
      expect(issue.details).not.toBeNull();
      expect(typeof issue.details!.expected).toBe('string');
      expect(typeof issue.details!.actual).toBe('string');
    });

    // Spot-check the two structured-breakdown ("extra") checks specifically.
    const overlap = issues.find((i) => i.check === 'overlapping-elements');
    expect(overlap!.details!.extra!.map((e) => e.label)).toEqual(['Element A', 'Element B']);

    const cramped = issues.find((i) => i.check === 'cramped-tap-targets');
    expect(cramped!.details!.extra!.map((e) => e.label)).toEqual(['Button A', 'Button B', 'Gap available']);
  }, 20000);
});

describe('scanAllViewports (real browser, real Next.js server)', () => {
  let nextServer: NextServerHandle;
  let baseUrl: string;

  beforeAll(async () => {
    nextServer = await startNextServer(PROJECT_ROOT);
    baseUrl = `http://localhost:${nextServer.port}`;
  }, 30000);

  afterAll(async () => {
    await nextServer.close();
  });

  it('scans one page across multiple viewports and flattens width/height per result', async () => {
    const { pages } = await scanAllViewports({
      urls: [`${baseUrl}/demo`],
      viewports: [
        { label: 'Mobile', width: MOBILE.width, height: MOBILE.height },
        { label: 'Desktop', width: DESKTOP.width, height: DESKTOP.height },
      ],
    });

    expect(pages).toHaveLength(1);
    expect(pages[0].viewports).toHaveLength(2);

    const mobile = pages[0].viewports.find((v) => v.label === 'Mobile');
    expect(mobile!.width).toBe(MOBILE.width);
    expect(mobile!.height).toBe(MOBILE.height);
    expect(mobile!.issues.length).toBeGreaterThan(0);

    const desktop = pages[0].viewports.find((v) => v.label === 'Desktop');
    expect(desktop!.issues.some((i) => i.check === 'horizontal-overflow')).toBe(false);
  }, 30000);

  it('throws a clear error when given no URLs', async () => {
    await expect(scanAllViewports({ urls: [], viewports: [MOBILE] })).rejects.toThrow(/No URLs to scan/);
  });

  it('throws a clear error when given no viewports', async () => {
    await expect(scanAllViewports({ urls: [`${baseUrl}/demo`], viewports: [] })).rejects.toThrow(
      /No viewports to check/
    );
  }, 20000);
});
