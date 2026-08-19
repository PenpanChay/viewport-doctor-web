'use strict';

const { chromium } = require('playwright');
const { runChecksInBrowser } = require('./checks');
const { buildFixSuggestions } = require('./suggestFixes');

/**
 * Draws a highlight box around every flagged element (in page-absolute
 * coordinates, so it lines up correctly in a full-page screenshot even
 * for issues below the fold), runs entirely inside the page like
 * runChecksInBrowser. Removed again after the screenshot is taken, so no
 * debug markup is left behind if the caller keeps using the same page.
 *
 * Each box also gets a numbered badge (1, 2, 3, ...) matching that issue's
 * position in the `issues` array - the same array, in the same order, that
 * the API returns and the frontend renders as its issue list (see
 * app/page.tsx's `activeResult.issues.map((issue, i) => ...)`), so "box #3
 * in the screenshot" and "issue #3 in the list" are always the same bug
 * without the two having to be cross-referenced by eye.
 */
function drawOverlayInBrowser({ issues, scrollX, scrollY }) {
  const layer = document.createElement('div');
  layer.setAttribute('data-viewport-doctor-overlay', 'true');
  layer.style.position = 'absolute';
  layer.style.left = '0';
  layer.style.top = '0';
  layer.style.width = '0';
  layer.style.height = '0';
  layer.style.pointerEvents = 'none';
  layer.style.zIndex = '2147483647';

  // Two different checks can flag the exact same element (e.g. the demo's
  // off-screen toast is also covered by the announcement bar, so it's both
  // offscreen-element and fixed-overlap) - their badges would otherwise
  // land on the identical pixel and only the last-drawn one would ever be
  // visible. Track how many badges have already claimed a given corner and
  // fan the next one out sideways instead of stacking invisibly.
  const badgeSlotsUsed = new Map();

  issues.forEach((issue, index) => {
    const left = issue.rect.x + scrollX;
    const top = issue.rect.y + scrollY;

    const box = document.createElement('div');
    box.style.position = 'absolute';
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.width = Math.max(issue.rect.width, 2) + 'px';
    box.style.height = Math.max(issue.rect.height, 2) + 'px';
    box.style.border = '3px solid #ec4899';
    box.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.9)';
    box.style.borderRadius = '4px';
    box.style.boxSizing = 'border-box';
    layer.appendChild(box);

    // Badge is anchored to the box's top-left corner, nudged half-out so
    // it reads clearly even when the flagged element itself is tiny -
    // clamped to >= 0 so it doesn't get pushed off the left/top edge of
    // the full-page screenshot for an element flagged right at x=0/y=0.
    const corner = `${Math.round(left)},${Math.round(top)}`;
    const slot = badgeSlotsUsed.get(corner) || 0;
    badgeSlotsUsed.set(corner, slot + 1);

    const badge = document.createElement('div');
    badge.textContent = String(index + 1);
    badge.style.position = 'absolute';
    badge.style.left = Math.max(0, left - 11 + slot * 22) + 'px';
    badge.style.top = Math.max(0, top - 11) + 'px';
    badge.style.minWidth = '20px';
    badge.style.height = '20px';
    badge.style.padding = '0 4px';
    badge.style.lineHeight = '20px';
    badge.style.textAlign = 'center';
    badge.style.borderRadius = '10px';
    badge.style.background = '#ec4899';
    badge.style.color = '#fff';
    badge.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    badge.style.fontSize = '12px';
    badge.style.fontWeight = '700';
    badge.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.9)';
    badge.style.boxSizing = 'border-box';
    layer.appendChild(badge);
  });

  document.body.appendChild(layer);
}

function removeOverlayInBrowser() {
  document.querySelectorAll('[data-viewport-doctor-overlay]').forEach((el) => el.remove());
}

/**
 * Opens one URL at one viewport size in a real headless browser, runs all
 * six responsive-layout checks, and captures a full-page screenshot with
 * a highlight box around every flagged element.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {{width: number, height: number}} viewport
 * @param {{timeoutMs?: number, settleMs?: number}} [options]
 * @returns {Promise<{
 *   url: string,
 *   viewport: {width:number,height:number},
 *   issues: Array<object>,
 *   screenshot: string,
 *   navigationError?: string
 * }>}
 */
async function scanViewport(browser, url, viewport, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const settleMs = options.settleMs ?? 500;

  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  let issues = [];
  let screenshot = '';
  let navigationError;

  try {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
      await page.waitForTimeout(settleMs);

      const result = await page.evaluate(runChecksInBrowser);
      issues = result.issues;

      if (issues.length > 0) {
        await page.evaluate(drawOverlayInBrowser, { issues, scrollX: result.scrollX, scrollY: result.scrollY });
      }

      const buffer = await page.screenshot({ fullPage: true });
      screenshot = `data:image/png;base64,${buffer.toString('base64')}`;

      if (issues.length > 0) {
        await page.evaluate(removeOverlayInBrowser);
      }
    } catch (err) {
      navigationError = err instanceof Error ? err.message : String(err);
    }
  } finally {
    await context.close();
  }

  return { url, viewport, issues, screenshot, ...(navigationError ? { navigationError } : {}) };
}

/**
 * Scans every URL at every viewport, sequentially (one real browser
 * shared across all of them) - screenshots and full-page DOM scans are
 * memory-heavy enough per page that running many concurrently isn't worth
 * the risk in a server API route with a fixed execution time budget.
 *
 * @param {{urls: string[], viewports: Array<{label: string, width: number, height: number}>, timeoutMs?: number, settleMs?: number}} options
 */
async function scanAllViewports(options) {
  const { urls, viewports, timeoutMs, settleMs } = options;

  if (!urls || urls.length === 0) {
    throw new Error('No URLs to scan - provide at least one page.');
  }
  if (!viewports || viewports.length === 0) {
    throw new Error('No viewports to check - select at least one.');
  }

  const browser = await chromium.launch();
  const pages = [];

  try {
    for (const url of urls) {
      const results = [];
      for (const viewport of viewports) {
        const result = await scanViewport(browser, url, { width: viewport.width, height: viewport.height }, {
          timeoutMs,
          settleMs,
        });
        // Flatten {viewport: {width, height}} to top-level width/height so
        // API consumers get one flat shape per viewport result instead of
        // having to reach into a nested object.
        results.push({
          label: viewport.label,
          width: viewport.width,
          height: viewport.height,
          issues: result.issues,
          screenshot: result.screenshot,
          ...(result.navigationError ? { navigationError: result.navigationError } : {}),
        });
      }
      // Cross-reference the same element's issue across every viewport
      // scanned for this URL, so the suggested fix can call out exactly
      // which sizes are already fine and must not be disturbed by a
      // global fix - see lib/suggestFixes.js.
      pages.push({ url, viewports: results, fixSuggestions: buildFixSuggestions({ viewports: results }) });
    }
  } finally {
    await browser.close();
  }

  return { pages };
}

module.exports = { scanViewport, scanAllViewports };
