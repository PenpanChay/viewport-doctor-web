import { describe, it, expect } from 'vitest';
import { buildFixSuggestions } from '../lib/suggestFixes.js';

const MOBILE = { label: 'Mobile', width: 390, height: 844 };
const DESKTOP = { label: 'Desktop', width: 1440, height: 900 };

function issueFixture(check, message = `${check} message`, selector = `div.${check}`, rect) {
  return { check, message, selector, ...(rect ? { rect } : {}) };
}

describe('buildFixSuggestions (pure, no browser/server needed)', () => {
  it('marks a bug present at every scanned viewport as unconditional (safe to fix globally)', () => {
    const pageResult = {
      viewports: [
        { ...MOBILE, issues: [issueFixture('clipped-element')] },
        { ...DESKTOP, issues: [issueFixture('clipped-element')] },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.check).toBe('clipped-element');
    expect(suggestion.elementVaries).toBe(false);
    expect(suggestion.selector).toBe('div.clipped-element');
    expect(suggestion.scoped).toBe(false);
    expect(suggestion.okViewports).toEqual([]);
    expect(suggestion.suggestion).toMatch(/occurs at every viewport/i);
    expect(suggestion.suggestion).toMatch(/Mobile \(390px\)/);
    expect(suggestion.suggestion).toMatch(/Desktop \(1440px\)/);
  });

  it('marks a bug present only at some viewports as scoped, with a breakpoint hint when the split is clean', () => {
    const pageResult = {
      viewports: [
        { ...MOBILE, issues: [issueFixture('horizontal-overflow')] },
        { ...DESKTOP, issues: [] },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.scoped).toBe(true);
    expect(suggestion.brokenViewports).toEqual([MOBILE]);
    expect(suggestion.okViewports).toEqual([DESKTOP]);
    expect(suggestion.breakpointHint).toMatch(/390px/);
    expect(suggestion.suggestion).toMatch(/only breaks/i);
    expect(suggestion.suggestion).toMatch(/already fine at Desktop \(1440px\)/);
    // The core ask: don't disturb the viewport that's already OK.
    expect(suggestion.suggestion).toMatch(/don't disturb/i);
  });

  it('merges horizontal-overflow findings into one page-level group even when the reported element differs by viewport', () => {
    // Mimics the real demo page: at a very narrow width the checker names
    // the whole <main>, but at a mid width it names two different, more
    // specific elements instead - same underlying page-level bug, three
    // different selectors.
    const TABLET = { label: 'Tablet', width: 768, height: 1024 };
    const pageResult = {
      viewports: [
        { ...MOBILE, issues: [issueFixture('horizontal-overflow', 'main overflow', 'main.container')] },
        {
          ...TABLET,
          issues: [
            issueFixture('horizontal-overflow', 'card overflow', 'div.card-three'),
            issueFixture('horizontal-overflow', 'dialog overflow', 'div.dialog'),
          ],
        },
        { ...DESKTOP, issues: [] },
      ],
    };
    const suggestions = buildFixSuggestions(pageResult);
    const horizontalOverflow = suggestions.filter((s) => s.check === 'horizontal-overflow');
    expect(horizontalOverflow).toHaveLength(1); // not 2 or 3, despite 3 distinct selectors

    const [suggestion] = horizontalOverflow;
    expect(suggestion.elementVaries).toBe(true);
    expect(suggestion.selector).toBeNull();
    // Tablet must count as broken exactly once, not twice, even though two
    // distinct elements were both flagged there.
    expect(suggestion.brokenViewports).toHaveLength(2);
    expect(suggestion.brokenViewports.map((v) => v.label).sort()).toEqual(['Mobile', 'Tablet']);
    expect(suggestion.okViewports).toEqual([DESKTOP]);
    expect(suggestion.scoped).toBe(true);
    // Wording must not claim the page-wide problem is "fixed" at Tablet just
    // because a different element was blamed there than at Mobile.
    expect(suggestion.suggestion).toMatch(/differ by viewport/i);
  });

  it('omits the breakpoint hint (but still flags scoped) when broken/OK widths interleave', () => {
    const TABLET = { label: 'Tablet', width: 768, height: 1024 };
    // Broken at 390 and 1440, OK at 768 - not a clean narrow-vs-wide split.
    const pageResult = {
      viewports: [
        { ...MOBILE, issues: [issueFixture('overlapping-elements')] },
        { ...TABLET, issues: [] },
        { ...DESKTOP, issues: [issueFixture('overlapping-elements')] },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.scoped).toBe(true);
    expect(suggestion.breakpointHint).toBeNull();
    expect(suggestion.suggestion).toMatch(/isn't a simple/i);
    expect(suggestion.suggestion).toMatch(/re-scan every viewport/i);
  });

  it('skips viewports that failed to navigate entirely', () => {
    const pageResult = {
      viewports: [
        { ...MOBILE, issues: [issueFixture('text-overflow')] },
        { ...DESKTOP, issues: [], navigationError: 'timeout' },
      ],
    };
    const suggestions = buildFixSuggestions(pageResult);
    expect(suggestions).toHaveLength(1);
    // Desktop never successfully loaded, so it must not be counted as "OK".
    expect(suggestions[0].okViewports).toEqual([]);
    expect(suggestions[0].scoped).toBe(false);
  });

  it('groups repeated issues for the same (check, selector) pair into one suggestion', () => {
    const pageResult = {
      viewports: [
        { ...MOBILE, issues: [issueFixture('oversized-modal', 'msg a', 'div.modal')] },
        { ...DESKTOP, issues: [issueFixture('oversized-modal', 'msg b', 'div.modal')] },
      ],
    };
    const suggestions = buildFixSuggestions(pageResult);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].brokenViewports).toHaveLength(2);
  });

  it('produces a distinct suggestion per check type, using each check\'s own fix template', () => {
    const checks = [
      'horizontal-overflow',
      'clipped-element',
      'overlapping-elements',
      'text-overflow',
      'oversized-modal',
      'overflowing-image',
      'broken-image',
      'offscreen-element',
      'fixed-overlap',
      'tiny-tap-target',
      'cramped-tap-targets',
      'tiny-text',
      'low-contrast-text',
      'distorted-image',
      'missing-viewport-meta',
    ];
    const pageResult = {
      viewports: [{ ...MOBILE, issues: checks.map((c) => issueFixture(c)) }],
    };
    const suggestions = buildFixSuggestions(pageResult);
    expect(suggestions).toHaveLength(checks.length);
    const texts = new Set(suggestions.map((s) => s.suggestion));
    expect(texts.size).toBe(checks.length); // every template is distinct
    // Every suggestion also carries a fixCode snippet, not just prose.
    suggestions.forEach((s) => expect(typeof s.fixCode).toBe('string'));
  });

  it('generates a fixCode snippet that targets the covering bar for fixed-overlap', () => {
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [
            issueFixture(
              'fixed-overlap',
              "Covered by a fixed element docked to the top (header.announce, 64px tall) - more than 30% of this element's area sits underneath it.",
              'h1'
            ),
          ],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/padding-top: 64px/);
    expect(suggestion.fixCode).toMatch(/header\.announce/);
  });

  it('generates a fixCode snippet naming the offending edge for offscreen-element', () => {
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [
            issueFixture(
              'offscreen-element',
              'Positioned (fixed) 20px past the top edge of the viewport - partially or fully outside the visible area.',
              'button.toast'
            ),
          ],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/top: 0;/);
    expect(suggestion.fixCode).toMatch(/position: static;/);
  });

  it('returns an empty array for a page with no issues at all', () => {
    const pageResult = { viewports: [{ ...MOBILE, issues: [] }, { ...DESKTOP, issues: [] }] };
    expect(buildFixSuggestions(pageResult)).toEqual([]);
  });

  it('handles a missing/malformed pageResult gracefully', () => {
    expect(buildFixSuggestions(undefined)).toEqual([]);
    expect(buildFixSuggestions({})).toEqual([]);
  });

  it('escapes Tailwind arbitrary-value class names (brackets, slashes) so the generated fixCode selector is valid CSS', () => {
    // A selector like `div.w-[500px]` is exactly what describe() in
    // checks.js produces for a Tailwind arbitrary-value class - but `[`,
    // `]`, and `/` are not valid inside an unescaped CSS identifier, so a
    // browser (or any real stylesheet) silently drops the ENTIRE rule if
    // they're pasted in as-is. Every class/id segment of the selector must
    // come out backslash-escaped in the actual generated code.
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [issueFixture('clipped-element', 'clip message', 'div.w-[500px].left-1/2#modal')],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/div\.w-\\\[500px\\\]\.left-1\\\/2#modal/);
    // And never the raw, unescaped form anywhere in the snippet.
    expect(suggestion.fixCode).not.toMatch(/div\.w-\[500px\]/);
  });

  it('caps horizontal-overflow fixCode at the real observed width per selector, not just flex properties', () => {
    // Flex properties alone (min-width/flex-shrink/flex-wrap) are a no-op
    // on a plain block element that isn't a flex item - e.g. a dialog with
    // a fixed pixel width. The generated rule must also cap max-width at
    // the element's own observed width so the fix actually works for that
    // case too, not just for flex-item causes.
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [
            issueFixture(
              'horizontal-overflow',
              'overflow message',
              'div.dialog',
              { x: 0, y: 0, width: 900, height: 80 }
            ),
          ],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/max-width: min\(900px, 95vw\);/);
    expect(suggestion.fixCode).toMatch(/flex-shrink: 1;/);
  });

  it('omits the max-width cap for horizontal-overflow when no rect width was observed (defensive fallback)', () => {
    const pageResult = {
      viewports: [{ ...MOBILE, issues: [issueFixture('horizontal-overflow', 'overflow message', 'div.thing')] }],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).not.toMatch(/max-width: min\(/);
    expect(suggestion.fixCode).toMatch(/flex-shrink: 1;/);
  });

  it('suggests margin/padding (not grid-column) for an ordinary overlapping-elements bug with no grid-cell collision noted', () => {
    // The plain, no-grid-context message every OTHER overlapping-elements
    // bug in this project produces (an absolutely-positioned badge over a
    // button, etc.) - the generic nudge is the right advice here, and
    // grid-column-start must NOT show up for a bug that was never about a
    // shared grid cell in the first place.
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [
            issueFixture(
              'overlapping-elements',
              'Overlaps with span.badge ("Popular") by more than 30% of its area.',
              'button.pro-plan'
            ),
          ],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/margin-top: 8px/);
    expect(suggestion.fixCode).not.toMatch(/grid-column-start/);
    expect(suggestion.suggestion).toMatch(/Add margin\/padding/);
    expect(suggestion.suggestion).not.toMatch(/grid-column/);
  });

  it('suggests grid-column-start (not margin) for an overlapping-elements bug that names a shared grid cell', () => {
    // lib/checks.js only appends this sentence when both flagged elements
    // are real CSS Grid items pinned to the exact same explicit
    // grid-column-start/grid-row-start - e.g. app/demo/page.tsx's
    // quick-stat strip. margin/padding is a no-op there (both items just
    // keep stretching to fill the shared cell), so this case needs its own
    // fix template entirely, not a tweaked version of the generic one.
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [
            issueFixture(
              'overlapping-elements',
              'Overlaps with button#stat-break-point ("<640px") by more than 30% of its area. Both are explicitly placed at the same grid cell (grid-column-start/grid-row-start: 1/1).',
              'button#stat-bug-count'
            ),
          ],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/grid-column-start: 2;/);
    expect(suggestion.fixCode).not.toMatch(/margin-top/);
    expect(suggestion.suggestion).toMatch(/same CSS Grid cell/);
    expect(suggestion.suggestion).toMatch(/grid-column/);
  });

  it('falls back to the generic overlapping-elements fix when the grid line named is not numeric (e.g. a named line)', () => {
    // Defensive: a named grid line (`grid-column-start: sidebar-start`) is
    // too ambiguous to safely auto-increment, so extractGridCollision()
    // should decline to match rather than emit invalid/meaningless CSS.
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [
            issueFixture(
              'overlapping-elements',
              'Overlaps with div.other by more than 30% of its area. Both are explicitly placed at the same grid cell (grid-column-start/grid-row-start: sidebar-start/1).',
              'div.thing'
            ),
          ],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/margin-top: 8px/);
    expect(suggestion.fixCode).not.toMatch(/grid-column-start: NaN/);
  });

  it('sizes a tiny-tap-target fixCode from the threshold named in the message, not a hardcoded 24', () => {
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [
            issueFixture(
              'tiny-tap-target',
              'Tap target is 18x18px - below the 24px minimum recommended for a comfortable touch target (WCAG 2.5.8).',
              'button.close'
            ),
          ],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/min-width: 24px;/);
    expect(suggestion.fixCode).toMatch(/min-height: 24px;/);
    expect(suggestion.fixCode).toMatch(/button\.close/);
  });

  it('adds spacing on the same axis reported for cramped-tap-targets (horizontal vs vertical)', () => {
    const horizontalResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [
            issueFixture(
              'cramped-tap-targets',
              'Only 4px horizontally from button.cancel - closer than the 8px minimum spacing recommended between tap targets.',
              'button.save'
            ),
          ],
        },
      ],
    };
    const [horizontal] = buildFixSuggestions(horizontalResult);
    expect(horizontal.fixCode).toMatch(/margin-right: 8px/);
    expect(horizontal.fixCode).not.toMatch(/margin-bottom/);

    const verticalResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [
            issueFixture(
              'cramped-tap-targets',
              'Only 3px vertically from a.link - closer than the 8px minimum spacing recommended between tap targets.',
              'a.other'
            ),
          ],
        },
      ],
    };
    const [vertical] = buildFixSuggestions(verticalResult);
    expect(vertical.fixCode).toMatch(/margin-bottom: 8px/);
    expect(vertical.fixCode).not.toMatch(/margin-right/);
  });

  it('generates a plain font-size fixCode for tiny-text', () => {
    const pageResult = {
      viewports: [{ ...MOBILE, issues: [issueFixture('tiny-text', 'Text renders at 10px - below the 12px minimum.', 'p.caption')] }],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/font-size: 12px/);
    expect(suggestion.fixCode).toMatch(/p\.caption/);
  });

  it('emits a placeholder (not a fabricated color) for low-contrast-text, since there is no single right answer', () => {
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [issueFixture('low-contrast-text', 'Text/background contrast is 2.62:1 - below the WCAG AA minimum of 4.5:1.', 'p.caption')],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/color: \/\* replace with a higher-contrast shade \*\//);
    // No real color value is fabricated - this stays a placeholder comment.
    expect(suggestion.fixCode).not.toMatch(/color: #/);
  });

  it('builds a real aspect-ratio fixCode from the natural size named in a distorted-image message', () => {
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [
            issueFixture(
              'distorted-image',
              'Rendered at 300x200 (ratio 1.50) but its natural size is 500x120 (ratio 4.17) - stretched/squished by 64%.',
              'img.banner'
            ),
          ],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/aspect-ratio: 500 \/ 120/);
    expect(suggestion.fixCode).toMatch(/width: 100%/);
  });

  it('falls back to a plain width/height reset for distorted-image when no natural size can be parsed', () => {
    const pageResult = {
      viewports: [{ ...MOBILE, issues: [issueFixture('distorted-image', 'some unparseable message', 'img.banner')] }],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).not.toMatch(/aspect-ratio/);
    expect(suggestion.fixCode).toMatch(/height: auto/);
  });

  it('generates a literal <meta> tag for missing-viewport-meta, with a paste-location note pointing at HTML/Next.js metadata, not CSS', () => {
    const pageResult = {
      viewports: [
        {
          ...MOBILE,
          issues: [issueFixture('missing-viewport-meta', 'No <meta name="viewport"> tag.', 'html')],
        },
      ],
    };
    const [suggestion] = buildFixSuggestions(pageResult);
    expect(suggestion.fixCode).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1" \/>/);
    expect(suggestion.fixCode).toMatch(/isn't a CSS fix - it's an HTML tag/);
    expect(suggestion.fixCode).toMatch(/export const viewport/);
  });
});
