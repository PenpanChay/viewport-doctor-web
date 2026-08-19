'use strict';

const { runChecksInBrowser } = require('./checks');
const { PAGE_LEVEL_CHECKS } = require('./suggestFixes');

/**
 * Answers "did this CSS actually fix it" by measuring, not guessing: opens
 * `url` in a real browser at `viewport`, runs the same DOM checks used by a
 * normal scan once with nothing changed (the "before" baseline), injects
 * `css` as a real temporary stylesheet via page.addStyleTag, waits for it
 * to settle, then runs the checks again in that same live page (the
 * "after" state). Nothing is written to disk and nothing about the site's
 * real source is touched - the browser context (and the injected style
 * along with it) is thrown away the moment this returns.
 *
 * This deliberately mirrors scanViewport.js's own navigation/settle
 * pattern rather than reusing it directly, because a preview needs the
 * SAME page instance for the before and after measurement (so nothing else
 * about the page - fonts loading, layout shift, random content - changes
 * between the two), whereas scanViewport always opens a fresh page per
 * call.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {{width: number, height: number}} viewport
 * @param {string} css - the CSS to try, verbatim (may be empty/falsy to
 *   just measure "before" twice, e.g. for a sanity check)
 * @param {{timeoutMs?: number, settleMs?: number}} [options]
 * @returns {Promise<{
 *   before: Array<object>,
 *   after: Array<object>,
 *   navigationError?: string,
 *   cssError?: string
 * }>}
 */
async function previewFix(browser, url, viewport, css, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const settleMs = options.settleMs ?? 400;

  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  let before = [];
  let after = [];
  let navigationError;
  let cssError;

  try {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
      await page.waitForTimeout(settleMs);

      const beforeResult = await page.evaluate(runChecksInBrowser);
      before = beforeResult.issues;

      if (css && css.trim()) {
        try {
          await page.addStyleTag({ content: css });
          await page.waitForTimeout(settleMs);
        } catch (err) {
          // A style tag can fail to attach in genuinely broken markup
          // (extremely rare) - surface it rather than silently reporting
          // "after" as identical to "before" and letting that look like
          // the fix simply didn't help.
          cssError = err instanceof Error ? err.message : String(err);
        }
      }

      const afterResult = await page.evaluate(runChecksInBrowser);
      after = afterResult.issues;
    } catch (err) {
      navigationError = err instanceof Error ? err.message : String(err);
    }
  } finally {
    await context.close();
  }

  return {
    before,
    after,
    ...(navigationError ? { navigationError } : {}),
    ...(cssError ? { cssError } : {}),
  };
}

// Checks whose suggested fix isn't real, injectable CSS a browser can
// meaningfully apply - the API route rejects these up front instead of
// running a browser for a fix that can never do anything:
// - broken-image: the fix is "correct the src attribute" - nothing to inject.
// - missing-viewport-meta: the fix is an HTML <meta> tag, not a stylesheet
//   rule at all.
// - low-contrast-text: the generated fixCode is intentionally a
//   placeholder (`color: /* replace with a higher-contrast shade */;`) -
//   there's no single right color to compute without knowing the site's
//   palette, so injecting it as-is would just be an inert, always-`unresolved`
//   preview rather than a real signal.
const NOT_PREVIEWABLE_CHECKS = new Set(['broken-image', 'missing-viewport-meta', 'low-contrast-text']);

// Worst (highest) severity among issues matching this bug - several checks
// can report more than one issue for the same logical bug (e.g. a bar
// covering three different pieces of content, or horizontal-overflow
// naming up to three offenders), so "how bad is this bug right now" means
// the worst one, not an arbitrary first match.
function worstSeverity(issues) {
  const values = issues.map((i) => i.severity).filter((v) => typeof v === 'number');
  return values.length > 0 ? Math.max(...values) : null;
}

function matchIssues(issues, { check, selector, elementVaries }) {
  return issues.filter((i) => i.check === check && (elementVaries || i.selector === selector));
}

/**
 * Pure comparison logic - no browser, no I/O - so it can be unit tested
 * directly and reused by the API route. Given the full "before" and
 * "after" issue lists from previewFix() plus which bug is being verified
 * (check + selector, or elementVaries for page-level checks like
 * horizontal-overflow), decides whether the fix actually worked:
 *
 * - 'resolved': no issue matching this bug remains at all - the strongest
 *   signal, not just "the number went down".
 * - 'improved': the bug is still present, but its severity measurement
 *   (overflow px, clip depth, overlap %, ...) genuinely went down - a
 *   partial fix, most often because a deeper element is now the culprit.
 * - 'unresolved': still present, severity unchanged - the CSS had no
 *   measurable effect on this bug (e.g. it targeted the wrong element).
 * - 'worse': still present, severity went UP - a real regression, worth
 *   surfacing loudly rather than burying in "unresolved".
 * - 'unknown': the bug wasn't even present in "before" at this
 *   viewport/URL, so there's nothing meaningful to compare against
 *   (e.g. the page changed between the original scan and this preview).
 *
 * `after` (the full list of still-matching issues post-fix) is returned
 * as-is so the caller can show exactly what's still wrong and where - the
 * "possible remaining cause" in the UI is nothing more than this list.
 */
function evaluatePreview({ before, after, check, selector, elementVaries }) {
  const matchedBefore = matchIssues(before, { check, selector, elementVaries });
  const matchedAfter = matchIssues(after, { check, selector, elementVaries });

  if (matchedBefore.length === 0) {
    return {
      verdict: 'unknown',
      beforeSeverity: null,
      afterSeverity: null,
      before: matchedBefore,
      after: matchedAfter,
    };
  }

  const beforeSeverity = worstSeverity(matchedBefore);
  const afterSeverity = worstSeverity(matchedAfter);

  let verdict;
  if (matchedAfter.length === 0) {
    verdict = 'resolved';
  } else if (beforeSeverity == null || afterSeverity == null) {
    // No numeric severity to compare (shouldn't happen for previewable
    // checks) - fall back to presence alone.
    verdict = 'unresolved';
  } else if (afterSeverity < beforeSeverity) {
    verdict = 'improved';
  } else if (afterSeverity > beforeSeverity) {
    verdict = 'worse';
  } else {
    verdict = 'unresolved';
  }

  return { verdict, beforeSeverity, afterSeverity, before: matchedBefore, after: matchedAfter };
}

module.exports = { previewFix, evaluatePreview, NOT_PREVIEWABLE_CHECKS, PAGE_LEVEL_CHECKS };
