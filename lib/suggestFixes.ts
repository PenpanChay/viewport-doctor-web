import type { FixSuggestion, FixSuggestionsInput, ViewportRequest } from './types';

/**
 * Rule-based "how to fix this" text generator - one template per check
 * type in lib/checks.ts, plus a scoping note computed by cross-referencing
 * the SAME element's issue across every viewport that was scanned for a
 * page. This is deliberately not code-generation or an LLM: it's generic,
 * framework-agnostic guidance grounded in exactly what was measured
 * (which viewports are already broken vs. already fine for this element),
 * so the advice can call out when a fix must be scoped (e.g. to a
 * max-width media query) instead of applied globally - a global fix for a
 * narrow-viewport bug can just as easily break a wide viewport that
 * currently passes, which is exactly what this is meant to help avoid.
 */

const BASE_FIXES: Record<string, string> = {
  'horizontal-overflow':
    'Remove fixed widths / `flex-shrink: 0` so content can shrink or wrap (relative units, `min-width: 0`, or `flex-wrap: wrap`). If the overflow is intentional (e.g. a carousel), scope `overflow-x: auto` to that element instead of the whole page.',
  'clipped-element':
    'Give the clipping ancestor room to grow, switch it to `overflow: auto` so content scrolls instead of being cut off, or let its children wrap.',
  'overlapping-elements':
    'Add margin/padding or adjust offset positioning so the boxes stop intersecting. If it\'s an intentional decorative overlay, add `pointer-events: none` to it instead.',
  'text-overflow':
    'To wrap: use a fluid width and `white-space: normal`. To truncate: add the missing `text-overflow: ellipsis` alongside the existing `overflow: hidden; white-space: nowrap`.',
  'oversized-modal':
    'Cap the dialog with `max-width: min(<current width>px, 95vw)` and `max-height: 90vh; overflow-y: auto` instead of a fixed pixel size.',
  'overflowing-image':
    'Add `max-width: 100%; height: auto` and remove any competing inline `width`.',
  'broken-image':
    "Fix the image's `src` - the path is wrong, the file is missing, or the request is failing.",
  'offscreen-element':
    'Remove the offset (`top`/`right`/`bottom`/`left`) or negative margin pushing it past the edge, or switch to `position: static`/`relative` so it stays in normal flow instead of being placed by coordinates that can push it off-screen.',
  'fixed-overlap':
    "Add padding or margin to the covered content equal to the fixed/sticky bar's own size (e.g. `padding-top` for a top header, `padding-bottom` or `scroll-margin-bottom` for a bottom nav) so content isn't hidden underneath it.",
  'tiny-tap-target':
    "Increase the element's min-width/min-height (or its padding) to at least 24px in both dimensions - the WCAG 2.5.8 minimum comfortable touch target size.",
  'cramped-tap-targets':
    "Add margin or gap between the two elements so there's at least 8px of breathing room - imprecise real-world taps need actual separation between adjacent targets, not just \"not touching\".",
  'tiny-text':
    "Increase font-size to at least 12px (or use a fluid/`clamp()` size that never drops below that) - text smaller than that is broadly illegible on a phone regardless of the zoom level users shouldn't have to apply.",
  'low-contrast-text':
    "Darken the text (on a light background) or lighten it (on a dark one) - or adjust the background instead - until the contrast ratio clears the WCAG AA minimum for the text's size.",
  'distorted-image':
    "Let only one dimension be fixed and set the other to `auto` (or use `aspect-ratio` matching the image's real proportions) instead of fixing width and height independently.",
  'missing-viewport-meta':
    'Add `<meta name="viewport" content="width=device-width, initial-scale=1">` inside `<head>` so mobile browsers render at the actual device width instead of a scaled-down desktop layout.',
};

const DEFAULT_BASE_FIX = 'Adjust the sizing or positioning so the flagged element fits its container.';

// overlapping-elements has two genuinely different root causes with two
// genuinely different fixes - see extractGridCollision() above - so its
// human-readable advice is picked per-issue instead of coming straight out
// of BASE_FIXES like every other check.
function overlappingElementsBaseFix(message: string): string {
  if (extractGridCollision(message)) {
    return 'Both elements are explicitly placed at the same CSS Grid cell, so margin/padding won\'t separate them - they\'ll just keep stretching to fill whatever cell they share. Give one of them its own `grid-column` (or `grid-column-start`) instead.';
  }
  return BASE_FIXES['overlapping-elements'];
}

// Shared across the two spots that need to say "this check can name a
// different element per viewport" (the grouped message and the per-suggestion
// note below) - was previously duplicated verbatim in both places.
const ELEMENT_VARIES_NOTE =
  "The offending element can differ by viewport - see each viewport's own issue list and screenshot.";

// A CSS identifier (a class or id name) may only contain letters, digits,
// hyphens and underscores unescaped - anything else needs a backslash in
// front of it to be part of a valid selector. Tailwind's own generated
// stylesheets do exactly this for arbitrary-value classes like
// `w-[320px]` (-> `.w-\[320px\]`) or `left-1/2` (-> `.left-1\/2`), and
// browsers are NOT forgiving about it at the individual-character level:
// an unescaped `[`, `]`, `/`, `:`, `%`, `(`, `)`, etc. inside a class name
// makes the WHOLE selector invalid, and an invalid selector makes the
// browser silently drop the entire rule - no console error, it just does
// nothing. That was happening to every fixCode snippet targeting one of
// this project's own Tailwind arbitrary-value classes until this fix.
function escapeCssIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

// `describe(el)` in lib/checks.ts builds selectors like
// `button#id.class1.class2 ("button text")` - the `("...")` suffix is a
// human-readable label, not valid CSS. Stripping it leaves a usable
// tag#id.class.class selector for the code snippet below - escaped per
// class/id segment so it's not just readable but actually valid CSS a
// browser (or a real stylesheet) will apply.
function selectorForCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/\s*\("[^"]*"\)\s*$/, '').trim();
  if (!stripped) return null;
  return stripped.replace(/[.#]([^.#\s]+)/g, (match, name) => match[0] + escapeCssIdentifier(name));
}

// clipped-element's message embeds the CLIPPING ANCESTOR's own describe()
// output - e.g. "Clipped by an ancestor with overflow:hidden (div.wrapper)."
// - which is what actually needs the CSS change, not the clipped element
// itself. Pull it back out so the code snippet targets the right node.
function extractAncestorSelector(message: string | undefined): string | null {
  const m = /overflow:hidden \((.+)\)\.$/.exec(message || '');
  return m ? selectorForCode(m[1]) : null;
}

// overlapping-elements' message names the OTHER element involved - e.g.
// "Overlaps with a#cta ("Buy now") by more than 30% of its area." - useful
// as a comment in the snippet so it's clear what's being avoided.
function extractOtherSelector(message: string | undefined): string | null {
  const m = /^Overlaps with (.+) by more than/.exec(message || '');
  return m ? selectorForCode(m[1]) : null;
}

interface GridCollision {
  col: number;
  row: number;
}

// overlapping-elements' message optionally names the shared CSS Grid line
// both elements are explicitly pinned to - e.g. "...same grid cell
// (grid-column-start/grid-row-start: 1/1)." - added by lib/checks.ts only
// when that's genuinely the structural cause (see its own comment). When
// present, margin/padding is the wrong fix entirely (both items would just
// keep stretching to fill the one cell they share) - moving one of them to
// its own grid-column is the fix that actually works, which is why this
// gets its own branch in buildFixCode() below instead of falling through
// to the generic nudge.
function extractGridCollision(message: string | undefined): GridCollision | null {
  const m = /same grid cell \(grid-column-start\/grid-row-start: (\S+)\/(\S+)\)/.exec(message || '');
  if (!m) return null;
  const col = Number(m[1]);
  const row = Number(m[2]);
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null; // named lines, not numeric - too ambiguous to auto-increment
  return { col, row };
}

// offscreen-element's message carries which edge it pokes past and by how
// much - e.g. "Positioned (fixed) 20px past the right edge of the
// viewport...". Reused so the code snippet can name the actual offset
// property that's most likely the culprit for that edge.
function extractOffscreenEdge(message: string | undefined): string | null {
  const m = /past the (left|right|top|bottom) edge/.exec(message || '');
  return m ? m[1] : null;
}

interface FixedBarInfo {
  edge: string;
  selector: string | null;
  size: number;
}

// fixed-overlap's message carries the covering bar's own selector, which
// edge it's docked to, and its height/width - e.g. "Covered by a fixed
// element docked to the top (header.site-header, 64px tall) - ...". Pulled
// back out so the code snippet can offset the covered content by the bar's
// actual size instead of a guessed placeholder.
function extractFixedBarInfo(message: string | undefined): FixedBarInfo | null {
  const m = /docked to the (top|bottom|floating) \((.+), (\d+)px tall\)/.exec(message || '');
  if (!m) return null;
  return { edge: m[1], selector: selectorForCode(m[2]), size: Number(m[3]) };
}

// oversized-modal's message carries the modal's own current rendered size -
// e.g. "Modal/dialog (900x76) is larger than the 390x844 viewport." - used
// so the code snippet can cap it at its OWN natural width instead of a
// placeholder value someone would have to fill in by hand (which also
// wouldn't be valid CSS if pasted or injected as-is).
function extractModalWidth(message: string | undefined): number | null {
  const m = /Modal\/dialog \((\d+)x\d+\)/.exec(message || '');
  return m ? Number(m[1]) : null;
}

// tiny-tap-target's message carries the exact minimum threshold used - e.g.
// "...below the 24px minimum..." - pulled back out rather than hardcoding
// 24 a second time here, so a future change to the check's own threshold
// can't silently desync from the generated fix.
function extractTapTargetMin(message: string | undefined): number | null {
  const m = /below the (\d+)px minimum/.exec(message || '');
  return m ? Number(m[1]) : null;
}

// cramped-tap-targets' message carries which axis was actually measured as
// too tight - e.g. "Only 3px horizontally from ..." - so the fix adds
// spacing on the SAME axis, not a guess.
function extractCrampedAxis(message: string | undefined): string | null {
  const m = /^Only \d+px (horizontally|vertically) from/.exec(message || '');
  return m ? m[1] : null;
}

interface NaturalImageSize {
  width: number;
  height: number;
}

// distorted-image's message carries the image's natural (unstretched) size
// - e.g. "...its natural size is 400x300 (ratio 1.33)..." - the exact
// numbers needed to build a real `aspect-ratio` declaration instead of a
// fill-in-the-blank placeholder.
function extractNaturalImageSize(message: string | undefined): NaturalImageSize | null {
  const m = /natural size is (\d+)x(\d+)/.exec(message || '');
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

interface RealSelectorEntry {
  selector: string;
  labels: string[];
  width: number | null;
}

interface BuildFixCodeInput {
  selector: string | null;
  message: string;
  realSelectors: RealSelectorEntry[] | null;
}

// One copy-pasteable CSS snippet per check type. These are best-effort,
// generic templates (like BASE_FIXES above) - they use the real selector
// where the scan reported one, but still need a human to sanity-check them
// against the actual markup/CSS before shipping.
function buildFixCode(check: string, { selector, message, realSelectors }: BuildFixCodeInput): string {
  const sel = selectorForCode(selector);
  switch (check) {
    case 'horizontal-overflow': {
      // Page-level check (see PAGE_LEVEL_CHECKS) - the checker can blame a
      // different real element at each viewport width, so instead of one
      // snippet we emit one real rule per distinct selector actually
      // observed, each labelled with the viewport(s) it was seen at. Only
      // fall back to a placeholder in the (should-be-impossible) case where
      // no selector was captured at all.
      if (realSelectors && realSelectors.length > 0) {
        const rules = realSelectors.map(({ selector: rawSel, labels, width }) => {
          const s = selectorForCode(rawSel) || rawSel;
          // Two independent, non-conflicting causes need covering here:
          // (a) a flex item that refuses to shrink (min-width/flex-shrink/
          // flex-wrap fix it), and (b) a plain block element with a fixed
          // pixel width, which those flex properties are a no-op on since
          // it isn't a flex item at all (e.g. a dialog with `width: 900px`
          // that's simply too wide for the viewport). Capping at the
          // element's own observed width - the same `max-width: min(<w>px,
          // 95vw)` pattern already used for oversized-modal - handles case
          // (b) without undoing case (a): a flex item that's already
          // narrower than its own cap is unaffected by the max-width, and
          // still gets to shrink/wrap via the properties below.
          const widthLine = width != null ? [`  max-width: min(${Math.round(width)}px, 95vw);`] : [];
          return [
            `/* Seen at: ${labels.join(', ')} */`,
            `${s} {`,
            ...widthLine,
            '  min-width: 0;',
            '  flex-shrink: 1;',
            '  flex-wrap: wrap;',
            '}',
          ].join('\n');
        });
        return [
          ...rules,
          '',
          '/* If the horizontal scroll is intentional (e.g. a carousel), contain it instead: */',
          `${selectorForCode(realSelectors[0].selector) || realSelectors[0].selector} {`,
          '  overflow-x: auto;',
          '}',
        ].join('\n');
      }
      return [
        '/* Target the element highlighted in the screenshot for this viewport */',
        '.overflowing-element {',
        '  min-width: 0;',
        '  flex-shrink: 1;',
        '  flex-wrap: wrap;',
        '}',
        '',
        '/* If the horizontal scroll is intentional (e.g. a carousel), contain it instead: */',
        '.overflowing-element {',
        '  overflow-x: auto;',
        '}',
      ].join('\n');
    }
    case 'clipped-element': {
      const ancestor = extractAncestorSelector(message) || '.clipping-ancestor';
      return `${ancestor} {\n  overflow: auto; /* was overflow: hidden - was clipping ${sel || 'the flagged element'} */\n}`;
    }
    case 'overlapping-elements': {
      const other = extractOtherSelector(message);
      const grid = extractGridCollision(message);
      if (grid) {
        // Both elements are pinned to the identical explicit grid cell -
        // margin/padding is a no-op here (they'd both keep stretching to
        // fill whatever cell they're in). The fix that actually works is
        // giving THIS element its own column, one line over from the
        // shared one - a real geometry change, not a nudge.
        return [
          `${sel || '.your-element'} {`,
          `  grid-column-start: ${grid.col + 1}; /* was ${grid.col} - same line the other element uses. Moving one line over gives each its own cell instead of sharing one. */`,
          '}',
          '',
          '/* Make sure your grid template has a column at that line (e.g. grid-template-columns), or use grid-column-end/span to size it explicitly. */',
          other ? `/* other element involved: ${other} */` : null,
        ]
          .filter((line): line is string => line !== null)
          .join('\n');
      }
      return [
        `${sel || '.your-element'} {`,
        '  margin-top: 8px; /* nudge apart - pick the direction/amount that fits your layout */',
        '}',
        '',
        '/* If this is an intentional decorative overlay instead, use this: */',
        `${sel || '.your-element'} {`,
        '  pointer-events: none;',
        '}',
        other ? `/* other element involved: ${other} */` : null,
      ]
        .filter((line): line is string => line !== null) // keep the '' blank-line separator; only drop the missing `other` comment
        .join('\n');
    }
    case 'text-overflow':
      return [
        '/* Option 1: let it wrap */',
        `${sel || '.your-element'} {`,
        '  width: auto;',
        '  white-space: normal;',
        '}',
        '',
        '/* Option 2: truncate with an ellipsis instead */',
        `${sel || '.your-element'} {`,
        '  overflow: hidden;',
        '  white-space: nowrap;',
        '  text-overflow: ellipsis;',
        '}',
      ].join('\n');
    case 'oversized-modal': {
      // Real, valid CSS either way: cap at the modal's own current width
      // when we know it (from the scan), or at 100% of its container
      // otherwise - never a fill-in-the-blank placeholder that would just
      // get ignored (invalid) if pasted or injected as-is.
      const modalWidth = extractModalWidth(message);
      const widthLimit = modalWidth != null ? `${modalWidth}px` : '100%';
      return [
        `${sel || '.your-modal'} {`,
        `  max-width: min(${widthLimit}, 95vw);`,
        '  max-height: 90vh;',
        '  overflow-y: auto;',
        '}',
      ].join('\n');
    }
    case 'overflowing-image':
      return [`${sel || 'img'} {`, '  max-width: 100%;', '  height: auto;', '}'].join('\n');
    case 'broken-image':
      return `/* Not a CSS fix - update the src attribute on ${sel || 'the flagged <img>'} to a valid, reachable image URL/path. */`;
    case 'offscreen-element': {
      const edge = extractOffscreenEdge(message);
      const offsetProp = edge || 'top/right/bottom/left';
      return [
        `${sel || '.your-element'} {`,
        `  ${offsetProp}: 0; /* replace the offset pushing this past the ${edge || 'viewport'} edge */`,
        '}',
        '',
        '/* Or take it out of coordinate-based positioning entirely: */',
        `${sel || '.your-element'} {`,
        '  position: static;',
        '}',
      ].join('\n');
    }
    case 'fixed-overlap': {
      const bar = extractFixedBarInfo(message);
      const contentSel = sel || '.your-content';
      if (bar && bar.edge !== 'floating') {
        const prop = bar.edge === 'top' ? 'padding-top' : 'padding-bottom';
        return `${contentSel} {\n  ${prop}: ${bar.size}px; /* matches ${bar.selector || 'the fixed/sticky bar'}'s height so it isn't hidden underneath it */\n}`;
      }
      return [
        `/* ${bar?.selector || 'The fixed/sticky element'} isn't docked to a single edge, so a plain */`,
        '/* padding offset may not fully clear it - add enough spacing on */',
        `${contentSel} {`,
        '  /* margin/padding */',
        '}',
        '/* to clear its actual position, or reposition the bar itself. */',
      ].join('\n');
    }
    case 'tiny-tap-target': {
      const min = extractTapTargetMin(message) || 24;
      return [
        `${sel || '.your-element'} {`,
        `  min-width: ${min}px;`,
        `  min-height: ${min}px;`,
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '}',
      ].join('\n');
    }
    case 'cramped-tap-targets': {
      const axis = extractCrampedAxis(message);
      const prop = axis === 'vertically' ? 'margin-bottom' : 'margin-right';
      return [`${sel || '.your-element'} {`, `  ${prop}: 8px; /* at least the 8px minimum recommended between tap targets */`, '}'].join(
        '\n'
      );
    }
    case 'tiny-text':
      return [
        `${sel || '.your-element'} {`,
        '  font-size: 12px; /* minimum legible size - raise further for body copy */',
        '}',
      ].join('\n');
    case 'low-contrast-text':
      return [
        `/* There's no single "right" color for ${sel || 'this element'} without knowing`,
        '   your palette - go darker on a light background (or lighter on a dark one)',
        "   until your browser devtools' contrast checker reports a pass. */",
        `${sel || '.your-element'} {`,
        '  color: /* replace with a higher-contrast shade */;',
        '}',
      ].join('\n');
    case 'distorted-image': {
      const natural = extractNaturalImageSize(message);
      if (natural) {
        return [
          `${sel || 'img'} {`,
          '  width: 100%;',
          '  height: auto;',
          `  aspect-ratio: ${natural.width} / ${natural.height}; /* the image's real, unstretched proportions */`,
          '}',
        ].join('\n');
      }
      return [`${sel || 'img'} {`, '  width: 100%;', '  height: auto;', '}'].join('\n');
    }
    case 'missing-viewport-meta':
      return '<meta name="viewport" content="width=device-width, initial-scale=1" />';
    default:
      return `/* Adjust ${sel || 'the flagged element'} so it fits its container. */`;
  }
}

// Prepends a short, unmissable comment telling the user which file to open
// and paste into - the #1 follow-up question after "here's some CSS" is
// "...where does this go?". Kept generic (no framework-specific file names)
// since this project doesn't know the target codebase's structure, but
// concrete enough to point at the right *kind* of file.
function addPasteLocationNote(code: string, check: string): string {
  if (check === 'broken-image') {
    return [
      '/* WHERE TO PASTE: this isn\'t a CSS fix. Open the component/template that',
      '   renders the flagged <img> (or the data source that supplies its URL) and',
      '   correct the src there instead. */',
      code,
    ].join('\n');
  }
  if (check === 'missing-viewport-meta') {
    return [
      "/* WHERE TO PASTE: this isn't a CSS fix - it's an HTML tag. Add it inside the",
      "   <head> of your page/layout template. In Next.js's App Router, export a",
      '   `viewport` object from layout.tsx instead of writing a literal <meta> tag:',
      '   export const viewport: Viewport = { width: "device-width", initialScale: 1 } */',
      code,
    ].join('\n');
  }
  return [
    "/* WHERE TO PASTE: add this to whatever CSS already styles this page - your",
    '   global stylesheet, a CSS module, or a `<style>`/styled-components block',
    '   next to the component. The selector(s) below are real ones the scan found',
    '   in the live page, so you can paste as-is and adjust the values. */',
    '',
    code,
  ].join('\n');
}

interface ScopeOptions {
  scoped: boolean;
  breakpointMaxWidth: number | null;
}

// Wraps a code snippet so applying it can't disturb a viewport that's
// already passing: unconditional bugs get the snippet as-is, a clean
// broken/OK split gets it scoped inside `@media (max-width: ...)`, and an
// interleaved split (no single width cleanly separates broken from OK) gets
// a warning comment instead of a media query that would misrepresent the
// data - see scopingNote() above for the matching prose.
function wrapCodeForScope(code: string, { scoped, breakpointMaxWidth }: ScopeOptions): string {
  if (!scoped) return code;
  if (breakpointMaxWidth != null) {
    const indented = code
      .split('\n')
      .map((line) => (line ? `  ${line}` : line))
      .join('\n');
    return `@media (max-width: ${breakpointMaxWidth}px) {\n${indented}\n}`;
  }
  return [
    '/* Broken and OK viewports interleave by width here, so a plain */',
    '/* max-width media query would not cleanly separate them - scope this */',
    '/* with a container query or a conditional class instead of applying */',
    '/* it globally: */',
    '',
    code,
  ].join('\n');
}

// horizontal-overflow deliberately reports only "the outermost element
// whose own parent doesn't overflow" (see lib/checks.ts) - by design, that
// can be a DIFFERENT element at different viewport sizes (e.g. the whole
// <main> at a very narrow width, but a specific card or dialog once the
// container itself no longer overflows). Grouping this check by selector
// like the others would make it look like the page-wide horizontal-scroll
// problem was "fixed" at a viewport where only the reported culprit moved
// deeper - so it's grouped per page instead, regardless of which element
// was named each time.
export const PAGE_LEVEL_CHECKS: Set<string> = new Set(['horizontal-overflow']);

function formatViewportList(list: ViewportRequest[]): string {
  return list.map((v) => `${v.label} (${v.width}px)`).join(', ');
}

interface ScopingNoteInput {
  scoped: boolean;
  breakpointHint: string | null;
  brokenViewports: ViewportRequest[];
  okViewports: ViewportRequest[];
}

function scopingNote({ scoped, breakpointHint, brokenViewports, okViewports }: ScopingNoteInput): string {
  if (!scoped) {
    return `Occurs at every viewport you scanned (${formatViewportList(brokenViewports)}) - safe to fix unconditionally.`;
  }
  const brokenList = formatViewportList(brokenViewports);
  const okList = formatViewportList(okViewports);
  if (breakpointHint) {
    return `Only breaks ${breakpointHint} (broken at ${brokenList}, already fine at ${okList}). Scope the fix to that range (e.g. a \`max-width\` media query or breakpoint variant) so you don't disturb ${okList}.`;
  }
  return `Breaks at ${brokenList} but not ${okList} - isn't a simple narrow-vs-wide split, so one media query may not separate them. Scope as narrowly as you can (per breakpoint or a container query) and re-scan every viewport to confirm ${okList} still passes.`;
}

interface FixGroup {
  check: string;
  selector: string | null;
  message: string;
  elementVaries: boolean;
  brokenViewportsByLabel: Map<string, ViewportRequest>;
  // Page-level checks throw away the single `selector` field above (there
  // isn't one bug-wide selector to report), but the code snippet still
  // needs to target *something* real - so keep every distinct selector
  // actually observed, and which viewport(s) each one showed up at,
  // instead of falling back to a fictional class name that matches nothing
  // in the real page.
  observedSelectorsByLabel: Map<string, { labels: Set<string>; width: number | null }> | null;
}

/**
 * `pageResult` is the per-page result shape scanAllViewports() produces
 * (before or after it's wrapped with a `url`) - only `viewports` is read.
 */
export function buildFixSuggestions(pageResult: FixSuggestionsInput): FixSuggestion[] {
  if (!pageResult || !Array.isArray(pageResult.viewports)) return [];

  const scannedViewports: ViewportRequest[] = pageResult.viewports
    .filter((vp) => !vp.navigationError)
    .map((vp) => ({ label: vp.label, width: vp.width, height: vp.height }));

  // Group issues across viewports by (check, selector) - the same element's
  // bug reported once per viewport it was found at, folded into one entry
  // so the fix advice and scoping note are generated once per real bug.
  // Page-level checks (see PAGE_LEVEL_CHECKS above) group by check alone,
  // since the specific element named can legitimately change per viewport.
  const groups = new Map<string, FixGroup>();
  for (const vp of pageResult.viewports) {
    if (vp.navigationError) continue;
    for (const issue of vp.issues) {
      const pageLevel = PAGE_LEVEL_CHECKS.has(issue.check);
      const key = pageLevel ? issue.check : `${issue.check}::${issue.selector}`;
      if (!groups.has(key)) {
        groups.set(key, {
          check: issue.check,
          selector: pageLevel ? null : issue.selector,
          message: pageLevel ? ELEMENT_VARIES_NOTE : issue.message,
          elementVaries: pageLevel,
          brokenViewportsByLabel: new Map(),
          observedSelectorsByLabel: pageLevel ? new Map() : null,
        });
      }
      const group = groups.get(key)!;
      // Dedupe by viewport label: a page-level group can otherwise see the
      // same viewport pushed twice (once per distinct offending element the
      // checker named at that size).
      group.brokenViewportsByLabel.set(vp.label, { label: vp.label, width: vp.width, height: vp.height });
      if (pageLevel && issue.selector && group.observedSelectorsByLabel) {
        const bucket = group.observedSelectorsByLabel;
        if (!bucket.has(issue.selector)) {
          bucket.set(issue.selector, { labels: new Set(), width: null });
        }
        const entry = bucket.get(issue.selector)!;
        entry.labels.add(vp.label);
        // Same element can be measured at slightly different widths across
        // viewports (e.g. percentage padding); keep the largest one seen so
        // the generated max-width cap is never narrower than the element
        // actually rendered at any scanned size.
        const observedWidth = issue.rect && typeof issue.rect.width === 'number' ? issue.rect.width : null;
        if (observedWidth != null && (entry.width == null || observedWidth > entry.width)) {
          entry.width = observedWidth;
        }
      }
    }
  }

  const suggestions: FixSuggestion[] = [];
  for (const group of groups.values()) {
    const brokenViewports = Array.from(group.brokenViewportsByLabel.values());
    const brokenLabels = new Set(brokenViewports.map((v) => v.label));
    const okViewports = scannedViewports.filter((v) => !brokenLabels.has(v.label));
    const scoped = okViewports.length > 0;

    let breakpointHint: string | null = null;
    let breakpointMaxWidth: number | null = null;
    if (scoped) {
      const maxBrokenWidth = Math.max(...brokenViewports.map((v) => v.width));
      const minOkWidth = Math.min(...okViewports.map((v) => v.width));
      // Only offer a concrete breakpoint hint when broken and OK viewports
      // don't interleave by width - otherwise a single media query
      // wouldn't cleanly separate them and saying so would be misleading.
      if (maxBrokenWidth < minOkWidth) {
        breakpointHint = `at widths up to ~${maxBrokenWidth}px`;
        breakpointMaxWidth = maxBrokenWidth;
      }
    }

    const varietyNote = group.elementVaries ? ` Note: ${ELEMENT_VARIES_NOTE}` : '';
    const baseFix =
      group.check === 'overlapping-elements' ? overlappingElementsBaseFix(group.message) : BASE_FIXES[group.check] || DEFAULT_BASE_FIX;

    // Turn { selector -> Set<label> } into a stable, ordered list for the
    // code generator - Map/Set preserve insertion order already, but this
    // makes the shape explicit and easy to consume.
    const realSelectors: RealSelectorEntry[] | null = group.observedSelectorsByLabel
      ? Array.from(group.observedSelectorsByLabel.entries()).map(([selector, { labels, width }]) => ({
          selector,
          labels: Array.from(labels),
          width,
        }))
      : null;

    const fixCode = addPasteLocationNote(
      wrapCodeForScope(buildFixCode(group.check, { selector: group.selector, message: group.message, realSelectors }), {
        scoped,
        breakpointMaxWidth,
      }),
      group.check
    );

    suggestions.push({
      check: group.check,
      selector: group.selector,
      message: group.message,
      elementVaries: group.elementVaries,
      brokenViewports,
      okViewports,
      scoped,
      breakpointHint,
      suggestion: `${baseFix} ${scopingNote({ scoped, breakpointHint, brokenViewports, okViewports })}${varietyNote}`,
      fixCode,
    });
  }

  return suggestions;
}
