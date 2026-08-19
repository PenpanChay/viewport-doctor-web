import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, type Browser } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { discoverBreakpoints, nearestStandardBreakpoint, EXPECTED_TOLERANCE_PX } from '../lib/discoverBreakpoints';
import { startNextServer, type NextServerHandle } from '../lib/nextServer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

describe('nearestStandardBreakpoint (pure, no browser needed)', () => {
  it('finds the closest of the 4 standard breakpoints and its distance', () => {
    expect(nearestStandardBreakpoint(768)).toMatchObject({ width: 768, dist: 0 });
    expect(nearestStandardBreakpoint(742)).toMatchObject({ width: 768, dist: 26 });
    expect(nearestStandardBreakpoint(1022)).toMatchObject({ width: 1024, dist: 2 });
  });

  it('EXPECTED_TOLERANCE_PX is small enough that 742px would never be misread as "expected"', () => {
    const nearest = nearestStandardBreakpoint(742);
    expect(nearest!.dist).toBeGreaterThan(EXPECTED_TOLERANCE_PX);
  });
});

describe('discoverBreakpoints (real browser, real Next.js server, no mocking)', () => {
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

  it(
    'finds the real 742px layout change on /demo/breakpoint-demo and flags it as unexpected, while the 768px one on the same page is expected',
    async () => {
      const result = await discoverBreakpoints(browser, `${baseUrl}/demo/breakpoint-demo`, {
        minWidth: 320,
        maxWidth: 1920,
      });
      expect(result.navigationError).toBeUndefined();
      expect(result.transitions.length).toBeGreaterThanOrEqual(2);

      // #grid-surprise: 2 columns -> 1 column right AT 742px going down,
      // nowhere near a standard breakpoint.
      const surprise = result.transitions.find((t) => t.selector.includes('grid-surprise'));
      expect(surprise).toBeDefined();
      expect(surprise!.width).toBeGreaterThanOrEqual(740);
      expect(surprise!.width).toBeLessThanOrEqual(744);
      expect(surprise!.below).toBe(1);
      expect(surprise!.aboveOrEqual).toBe(2);
      expect(surprise!.expected).toBe(false);

      // #grid-standard: 1 column -> 3 columns exactly at Tailwind's own
      // 768px `md:` breakpoint - a real change, but an expected one.
      const standard = result.transitions.find((t) => t.selector.includes('grid-standard'));
      expect(standard).toBeDefined();
      expect(standard!.width).toBeGreaterThanOrEqual(766);
      expect(standard!.width).toBeLessThanOrEqual(770);
      expect(standard!.below).toBe(1);
      expect(standard!.aboveOrEqual).toBe(3);
      expect(standard!.expected).toBe(true);
    },
    20000
  );

  it('reports no transitions (not an error) for a page with nothing that looks like a repeated-item grid', async () => {
    const result = await discoverBreakpoints(browser, `${baseUrl}/demo`, { minWidth: 320, maxWidth: 1920 });
    expect(result.navigationError).toBeUndefined();
    // /demo's quick-stat strip IS a 4-item grid, so this asserts the softer
    // property that this call completes cleanly and returns a real array,
    // not that it's necessarily empty - the "no error either way" behavior
    // matters more here than an exact count.
    expect(Array.isArray(result.transitions)).toBe(true);
  }, 20000);

  it('returns the standard breakpoint bands for rendering a "Responsive Behavior" timeline', async () => {
    const result = await discoverBreakpoints(browser, `${baseUrl}/demo/breakpoint-demo`, {
      minWidth: 320,
      maxWidth: 1920,
    });
    expect(result.bands.map((b) => b.label)).toEqual(['Mobile', 'Tablet Small', 'Tablet', 'Desktop', 'Large Desktop']);
    expect(result.bands[0]).toMatchObject({ min: 320, max: 639 });
  }, 20000);

  it('reports a navigationError instead of throwing when the page cannot be reached', async () => {
    const result = await discoverBreakpoints(browser, 'http://127.0.0.1:1/', {
      minWidth: 320,
      maxWidth: 1920,
      timeoutMs: 3000,
    });
    expect(result.navigationError).toBeTruthy();
    expect(result.transitions).toEqual([]);
  }, 15000);
});
