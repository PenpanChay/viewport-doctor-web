import type { Issue, IssueDetails, RunChecksResult } from './types';

/**
 * Runs entirely inside the browser page (passed straight to
 * page.evaluate() - Playwright serializes the function itself and
 * executes it in the page's own JS context). Must stay a single
 * self-contained function with no references to anything outside itself;
 * every helper it needs is declared inside it. The type annotations below
 * are compile-time only (TypeScript strips them before Playwright ever
 * sees the function) - the runtime body is identical plain JS either way.
 *
 * Detects fifteen categories of responsive-layout and legibility bugs at
 * whatever viewport size the page was opened at, purely from real DOM
 * measurements and computed styles - no heuristics based on screenshots or
 * pixel-diffing, just geometry (and, for a few checks, the same contrast
 * math a browser devtools accessibility panel uses) that's either broken
 * or it isn't.
 *
 * Each issue also carries a `severity` number - a check-specific "how far
 * off is this, in pixels or percent" measurement (e.g. overflow px, clip
 * depth px, overlap %) computed from the exact same geometry that decided
 * the issue fired at all. It has no meaning compared ACROSS check types,
 * only before vs. after for the SAME check - which is exactly what
 * lib/previewFix.ts needs to answer "did applying this CSS actually help,
 * fully fix it, or do nothing" instead of just "is it still in the list".
 */
export function runChecksInBrowser(): RunChecksResult {
  const TOLERANCE = 4; // px - avoids flagging sub-pixel/scrollbar rounding noise
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const issues: Issue[] = [];

  function rectOf(el: Element) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }

  function describe(el: Element | null): string {
    if (!el) return 'unknown element';
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls =
      el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
    const text = (el.textContent || '').trim().slice(0, 40).replace(/\s+/g, ' ');
    return `${tag}${id}${cls}${text ? ` ("${text}")` : ''}`;
  }

  function isVisible(el: Element): boolean {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // `details` is an optional, pre-formatted, check-specific breakdown of
  // exactly what was measured - { expected, actual, delta, extra } - so a
  // UI can render "Expected / Actual / Overflow" style fields directly
  // instead of regex-scraping them back out of the free-text `message`
  // (fragile, and couples the UI's rendering to the exact wording of a
  // human-readable sentence). `extra` is an optional array of additional
  // named numeric facts a specific check needs beyond the plain three (e.g.
  // cramped-tap-targets naming both elements' own widths, not just the gap
  // between them).
  function addIssue(
    check: string,
    message: string,
    el: Element,
    severity?: number | null,
    details?: IssueDetails | null
  ) {
    issues.push({
      check,
      message,
      selector: describe(el),
      rect: rectOf(el),
      severity: severity ?? null,
      details: details ?? null,
    });
  }

  // --- 1. Horizontal overflow: the page is wider than the viewport ---
  if (document.documentElement.scrollWidth > viewportWidth + TOLERANCE) {
    const all = Array.from(document.body.querySelectorAll('*')).filter(isVisible);
    const overflowingEls = all.filter((el) => el.getBoundingClientRect().right > viewportWidth + TOLERANCE);

    // Report the most SPECIFIC overflowing elements: drop any overflowing
    // element that has an overflowing descendant of its own, since that
    // descendant is the more precise, more actionable cause. This matters
    // because a CSS box never has to enlarge itself just because a child
    // paints outside it via ordinary visible overflow - a flex/block
    // container can measure narrower than a child several levels down that
    // reaches even further right (e.g. one specific unshrinkable card in a
    // non-wrapping row). Reporting only the container in that case leaves
    // the highlighted box in the screenshot stopping short of content
    // that's still visibly poking out past it - which reads as a
    // rendering glitch, not "this is the bug." Filtering down to elements
    // with no overflowing descendant guarantees every highlighted box
    // reaches all the way to a real, visible edge of the overflow.
    const offenders = overflowingEls.filter(
      (el) => !overflowingEls.some((other) => other !== el && el.contains(other))
    );
    // Plain text/typography tags (h1, p, span, ...) very often pass this
    // filter too, purely by coincidence: a heading or paragraph can be
    // exactly as wide as a sibling section that grew for a completely
    // unrelated reason, simply because both inherited the same container
    // width - they didn't cause anything, they're just victims of it.
    // With only 3 slots, those coincidental matches must not bump out the
    // structural elements (rows, cards, images, ...) that are the actual,
    // fixable cause - so text tags are sorted after every non-text tag,
    // and only worst-first (furthest right) within each of those two
    // groups, so the real cause is always seen before any coincidence.
    const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'label', 'li', 'strong', 'em']);
    const byRightDesc = (a: Element, b: Element) => b.getBoundingClientRect().right - a.getBoundingClientRect().right;
    const structural = offenders.filter((el) => !TEXT_TAGS.has(el.tagName.toLowerCase())).sort(byRightDesc);
    const textual = offenders.filter((el) => TEXT_TAGS.has(el.tagName.toLowerCase())).sort(byRightDesc);
    const ordered = [...structural, ...textual];
    const overflowPx = Math.round(document.documentElement.scrollWidth - viewportWidth);
    (ordered.length ? ordered : [document.body]).slice(0, 3).forEach((el) => {
      // Per-element numbers, not the page-wide overflowPx reused for every
      // offender: this specific element's own right edge is what actually
      // needs to come back inside the viewport, and different offenders in
      // the same batch can extend different amounts past it.
      const elRect = el.getBoundingClientRect();
      const elOverflow = Math.round(elRect.right - viewportWidth);
      addIssue(
        'horizontal-overflow',
        `Page content is ${overflowPx}px wider than the ${viewportWidth}px viewport - causes horizontal scrolling.`,
        el,
        overflowPx,
        {
          expected: `≤ ${viewportWidth}px`,
          actual: `${Math.round(elRect.right)}px`,
          delta: `Overflow: ${elOverflow}px`,
        }
      );
    });
  }

  // --- 2. Clipped/cut-off interactive elements ---
  const interactive = Array.from(
    document.querySelectorAll('button, a[href], input, [role="button"], [role="link"]')
  ).filter(isVisible);
  // Tracked so check 7 (offscreen-element) doesn't re-report the same
  // element under a second, less specific diagnosis - "an ancestor is
  // clipping you" is more actionable than "you're off-screen".
  const clippedElements = new Set<Element>();
  interactive.forEach((el) => {
    let ancestor = el.parentElement;
    while (ancestor && ancestor !== document.body) {
      const style = getComputedStyle(ancestor);
      const clips =
        style.overflowX === 'hidden' ||
        style.overflowY === 'hidden' ||
        style.overflow === 'hidden' ||
        style.overflow === 'clip';
      if (clips) {
        const elRect = el.getBoundingClientRect();
        const ancestorRect = ancestor.getBoundingClientRect();
        const clipped =
          elRect.right > ancestorRect.right + TOLERANCE ||
          elRect.bottom > ancestorRect.bottom + TOLERANCE ||
          elRect.left < ancestorRect.left - TOLERANCE ||
          elRect.top < ancestorRect.top - TOLERANCE;
        if (clipped) {
          // How far past the clipping ancestor's own edge this element
          // pokes, in the worst-offending direction - the number that
          // needs to shrink to (or below) zero for the clip to be resolved.
          const clipSeverity = Math.round(
            Math.max(
              elRect.right - ancestorRect.right,
              elRect.bottom - ancestorRect.bottom,
              ancestorRect.left - elRect.left,
              ancestorRect.top - elRect.top
            )
          );
          addIssue(
            'clipped-element',
            `Clipped by an ancestor with overflow:hidden (${describe(ancestor)}).`,
            el,
            clipSeverity,
            {
              expected: `fits within ${describe(ancestor)}`,
              actual: `pokes out by ${clipSeverity}px`,
              delta: `Clipped: ${clipSeverity}px`,
            }
          );
          clippedElements.add(el);
          break;
        }
      }
      ancestor = ancestor.parentElement;
    }
  });

  // --- 3. Overlapping interactive elements ---
  const candidates = Array.from(document.querySelectorAll('button, a[href], input, [role="button"]')).filter(
    isVisible
  );
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.contains(b) || b.contains(a)) continue; // ancestor/descendant nesting isn't an overlap bug
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const xOverlap = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
      const yOverlap = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
      const overlapArea = xOverlap * yOverlap;
      const smallerArea = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (smallerArea > 0 && overlapArea / smallerArea > 0.3) {
        const overlapPercent = Math.round((overlapArea / smallerArea) * 100);

        // Name the STRUCTURAL cause when it's a real one: two grid items
        // explicitly pinned to the exact same cell. That's a meaningfully
        // different bug from two ordinary siblings that happen to collide
        // (an absolutely-positioned badge over a button, a negative margin,
        // ...) - nudging one of THOSE apart with margin/padding genuinely
        // works, but two grid items sharing one cell both stretch to fill
        // it regardless of margin, so the real fix is giving one of them
        // its own `grid-column`/`grid-row` instead. Grid-aware guidance
        // only fires when both elements share a `display: grid`/
        // `inline-grid` parent AND resolve to the same explicit
        // grid-column-start/grid-row-start (never for 'auto' - an
        // auto-placed item isn't "pinned" to anything) - see
        // lib/suggestFixes.ts's extractGridCollision(), which parses this
        // same sentence back out to build the smarter fix.
        let gridNote = '';
        const parentA = a.parentElement;
        const parentB = b.parentElement;
        if (parentA && parentA === parentB) {
          const parentDisplay = getComputedStyle(parentA).display;
          if (parentDisplay === 'grid' || parentDisplay === 'inline-grid') {
            const colA = getComputedStyle(a).gridColumnStart;
            const rowA = getComputedStyle(a).gridRowStart;
            const colB = getComputedStyle(b).gridColumnStart;
            const rowB = getComputedStyle(b).gridRowStart;
            if (colA !== 'auto' && rowA !== 'auto' && colA === colB && rowA === rowB) {
              gridNote = ` Both are explicitly placed at the same grid cell (grid-column-start/grid-row-start: ${colA}/${rowA}).`;
            }
          }
        }

        addIssue(
          'overlapping-elements',
          `Overlaps with ${describe(b)} by more than 30% of its area.${gridNote}`,
          a,
          overlapPercent,
          {
            expected: 'no overlap (< 30% of the smaller element\'s area)',
            actual: `${overlapPercent}% overlap`,
            delta: `Overlap: ${overlapPercent}%`,
            extra: [
              { label: 'Element A', value: `${Math.round(ra.width)}x${Math.round(ra.height)}px` },
              { label: 'Element B', value: `${Math.round(rb.width)}x${Math.round(rb.height)}px` },
            ],
          }
        );
      }
    }
  }

  // --- 4. Text overflow/truncation ---
  const textEls = Array.from(
    document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, button, a, label, li')
  ).filter(isVisible);
  textEls.forEach((el) => {
    if (el.children.length > 2) return; // skip containers; focus on leaf-ish text elements
    const style = getComputedStyle(el);
    if (style.textOverflow === 'ellipsis') return; // handled intentionally
    if (el.scrollWidth > el.clientWidth + TOLERANCE && style.whiteSpace !== 'normal') {
      addIssue(
        'text-overflow',
        'Text is wider than its box and has no ellipsis/wrap handling - it overflows or gets cut off.',
        el,
        Math.round(el.scrollWidth - el.clientWidth),
        {
          expected: `≤ ${el.clientWidth}px box`,
          actual: `${el.scrollWidth}px of text`,
          delta: `Overflow: ${Math.round(el.scrollWidth - el.clientWidth)}px`,
        }
      );
    }
  });

  // --- 5. Oversized modal/dialog ---
  const modalCandidates = Array.from(
    document.querySelectorAll('dialog, [role="dialog"], [class*="modal" i], [class*="dialog" i]')
  ).filter(isVisible);
  modalCandidates.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width > viewportWidth + TOLERANCE || rect.height > viewportHeight + TOLERANCE) {
      addIssue(
        'oversized-modal',
        `Modal/dialog (${Math.round(rect.width)}x${Math.round(rect.height)}) is larger than the ${viewportWidth}x${viewportHeight} viewport.`,
        el,
        Math.round(Math.max(rect.width - viewportWidth, rect.height - viewportHeight)),
        {
          expected: `≤ ${viewportWidth}x${viewportHeight}px`,
          actual: `${Math.round(rect.width)}x${Math.round(rect.height)}px`,
          delta: `Over by: ${Math.round(Math.max(rect.width - viewportWidth, rect.height - viewportHeight))}px`,
        }
      );
    }
  });

  // --- 6. Overflowing/broken images ---
  Array.from(document.querySelectorAll('img'))
    .filter(isVisible)
    .forEach((img) => {
      if (img.complete && img.naturalWidth === 0) {
        addIssue('broken-image', 'Image failed to load.', img, null, {
          expected: 'loads successfully',
          actual: 'failed to load (naturalWidth is 0)',
          delta: null,
        });
        return;
      }
      const parent = img.parentElement;
      if (!parent) return;
      const imgRect = img.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      if (imgRect.width > parentRect.width + TOLERANCE) {
        addIssue(
          'overflowing-image',
          `Image (${Math.round(imgRect.width)}px) is wider than its container (${Math.round(parentRect.width)}px) - likely missing max-width: 100%.`,
          img,
          Math.round(imgRect.width - parentRect.width),
          {
            expected: `≤ ${Math.round(parentRect.width)}px`,
            actual: `${Math.round(imgRect.width)}px`,
            delta: `Overflow: ${Math.round(imgRect.width - parentRect.width)}px`,
          }
        );
      }
    });

  // --- 7. Off-screen positioned elements: an interactive element pushed
  // outside the viewport by its own explicit offset (position: fixed,
  // absolute, sticky, or relative with top/left/right/bottom), not by
  // inheriting extra width from a growing ancestor (horizontal-overflow's
  // territory) or being cut off by an overflow:hidden ancestor
  // (clipped-element's territory, so those are skipped here). This is
  // exactly the "button/badge positioned with a bad negative offset" bug
  // that horizontal-overflow can miss entirely: position: fixed elements
  // in particular don't contribute to document.scrollWidth at all, so an
  // off-screen fixed element causes no scrollbar and is otherwise silent.
  interactive.forEach((el) => {
    if (clippedElements.has(el)) return;
    const style = getComputedStyle(el);
    if (style.position === 'static') return;
    const rect = el.getBoundingClientRect();
    const offRight = rect.right > viewportWidth + TOLERANCE;
    const offLeft = rect.left < -TOLERANCE;
    const offBottom = rect.bottom > viewportHeight + TOLERANCE;
    const offTop = rect.top < -TOLERANCE;
    if (!offRight && !offLeft && !offBottom && !offTop) return;
    const edge = offRight ? 'right' : offLeft ? 'left' : offBottom ? 'bottom' : 'top';
    const overshoot = Math.round(
      edge === 'right'
        ? rect.right - viewportWidth
        : edge === 'left'
          ? -rect.left
          : edge === 'bottom'
            ? rect.bottom - viewportHeight
            : -rect.top
    );
    // "Expected/actual" are framed around whichever edge actually failed -
    // a right/bottom edge is expected to stay at or under the
    // viewport's own width/height, a left/top edge is expected to stay at
    // or past 0 - so the pair always reads as "this coordinate, this limit"
    // for the SPECIFIC edge that's wrong, not a generic restatement.
    const edgeCoord = edge === 'right' ? rect.right : edge === 'left' ? rect.left : edge === 'bottom' ? rect.bottom : rect.top;
    const edgeLimit = edge === 'right' ? viewportWidth : edge === 'left' ? 0 : edge === 'bottom' ? viewportHeight : 0;
    const edgeLabel = `${edge[0].toUpperCase()}${edge.slice(1)} edge`;
    addIssue(
      'offscreen-element',
      `Positioned (${style.position}) ${overshoot}px past the ${edge} edge of the viewport - partially or fully outside the visible area.`,
      el,
      overshoot,
      {
        expected: edge === 'right' || edge === 'bottom' ? `≤ ${edgeLimit}px` : `≥ ${edgeLimit}px`,
        actual: `${Math.round(edgeCoord)}px`,
        delta: `${edgeLabel}: ${Math.round(edgeCoord)}px (viewport: ${edge === 'right' || edge === 'left' ? viewportWidth : viewportHeight}px)`,
      }
    );
  });

  // --- 8. Fixed/sticky element covering page content ---
  const fixedOrSticky = Array.from(document.body.querySelectorAll('*')).filter((el) => {
    if (!isVisible(el)) return false;
    const position = getComputedStyle(el).position;
    return position === 'fixed' || position === 'sticky';
  });
  if (fixedOrSticky.length > 0) {
    const contentCandidates = Array.from(
      document.querySelectorAll('button, a[href], input, [role="button"], [role="link"], p, h1, h2, h3, h4, h5, h6, li')
    ).filter(isVisible);
    fixedOrSticky.forEach((bar) => {
      const barRect = bar.getBoundingClientRect();
      if (barRect.width === 0 || barRect.height === 0) return;
      // Only bars actually docked to one edge get a confident, actionable
      // "add this much padding" note (see suggestFixes.ts) - a bar floating
      // in the middle of the page needs a human to look at it instead.
      const dockedTop = barRect.top <= TOLERANCE;
      const dockedBottom = barRect.bottom >= viewportHeight - TOLERANCE;
      const edge = dockedTop ? 'top' : dockedBottom ? 'bottom' : 'floating';
      const covered = contentCandidates.filter((el) => {
        if (el === bar || bar.contains(el) || el.contains(bar)) return false; // the bar's own content isn't "covered"
        const elRect = el.getBoundingClientRect();
        const xOverlap = Math.max(0, Math.min(barRect.right, elRect.right) - Math.max(barRect.left, elRect.left));
        const yOverlap = Math.max(0, Math.min(barRect.bottom, elRect.bottom) - Math.max(barRect.top, elRect.top));
        const overlapArea = xOverlap * yOverlap;
        const elArea = elRect.width * elRect.height;
        return elArea > 0 && overlapArea / elArea > 0.3;
      });
      covered.slice(0, 3).forEach((el) => {
        const elRect = el.getBoundingClientRect();
        const xOverlap = Math.max(0, Math.min(barRect.right, elRect.right) - Math.max(barRect.left, elRect.left));
        const yOverlap = Math.max(0, Math.min(barRect.bottom, elRect.bottom) - Math.max(barRect.top, elRect.top));
        const elArea = elRect.width * elRect.height;
        const overlapPercent = elArea > 0 ? Math.round(((xOverlap * yOverlap) / elArea) * 100) : 0;
        addIssue(
          'fixed-overlap',
          `Covered by a ${getComputedStyle(bar).position} element docked to the ${edge} (${describe(bar)}, ${Math.round(barRect.height)}px tall) - more than 30% of this element's area sits underneath it.`,
          el,
          overlapPercent,
          {
            expected: 'not covered (< 30% of its own area underneath the fixed/sticky element)',
            actual: `${overlapPercent}% covered`,
            delta: `Covered: ${overlapPercent}%`,
            extra: [{ label: 'Covering element', value: `${describe(bar)}, ${Math.round(barRect.height)}px tall` }],
          }
        );
      });
    });
  }

  // --- 9. Tap targets too small for touch (WCAG 2.5.8 Target Size Minimum) ---
  const MIN_TAP_TARGET = 24; // px - the WCAG 2.2 minimum, not the more generous 44px "comfortable" guideline
  candidates.forEach((el) => {
    const r = el.getBoundingClientRect();
    const shortestSide = Math.min(r.width, r.height);
    if (shortestSide < MIN_TAP_TARGET - TOLERANCE) {
      addIssue(
        'tiny-tap-target',
        `Tap target is ${Math.round(r.width)}x${Math.round(r.height)}px - below the ${MIN_TAP_TARGET}px minimum recommended for a comfortable touch target (WCAG 2.5.8).`,
        el,
        Math.round(MIN_TAP_TARGET - shortestSide),
        {
          expected: `≥ ${MIN_TAP_TARGET}x${MIN_TAP_TARGET}px`,
          actual: `${Math.round(r.width)}x${Math.round(r.height)}px`,
          delta: `Short by: ${Math.round(MIN_TAP_TARGET - shortestSide)}px`,
        }
      );
    }
  });

  // --- 10. Tap targets crammed too close together - NOT overlapping (that's
  // check 3's territory, a negative gap), just uncomfortably close, which
  // risks mis-taps on a real touchscreen even though nothing technically
  // intersects. Reuses `candidates` from check 3. ---
  const MIN_TAP_GAP = 8; // px
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const rowsShareABand = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 0;
      const colsShareABand = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 0;
      const xGap = Math.max(ra.left, rb.left) - Math.min(ra.right, rb.right);
      const yGap = Math.max(ra.top, rb.top) - Math.min(ra.bottom, rb.bottom);
      // Side-by-side (share a row band) with a thin horizontal gap, or
      // stacked (share a column band) with a thin vertical gap - either way
      // a small POSITIVE gap, unlike check 3's negative one (true overlap).
      const sideBySideCramped = rowsShareABand && xGap > 0 && xGap < MIN_TAP_GAP;
      const stackedCramped = colsShareABand && yGap > 0 && yGap < MIN_TAP_GAP;
      if (sideBySideCramped || stackedCramped) {
        const gap = sideBySideCramped ? xGap : yGap;
        const axis = sideBySideCramped ? 'horizontally' : 'vertically';
        addIssue(
          'cramped-tap-targets',
          `Only ${Math.round(gap)}px ${axis} from ${describe(b)} - closer than the ${MIN_TAP_GAP}px minimum spacing recommended between tap targets.`,
          a,
          Math.round(MIN_TAP_GAP - gap),
          {
            expected: `≥ ${MIN_TAP_GAP}px gap`,
            actual: `${Math.round(gap)}px gap`,
            delta: `Short by: ${Math.round(MIN_TAP_GAP - gap)}px`,
            // "Available" is the real gap actually measured between the two
            // elements' own edges - not a container width - so it reads
            // directly against the two elements' own sizes: each button is
            // comfortably sized on its own, but the space actually left
            // between them is below the 8px minimum.
            extra: [
              { label: 'Button A', value: `${Math.round(ra.width)}x${Math.round(ra.height)}px` },
              { label: 'Button B', value: `${Math.round(rb.width)}x${Math.round(rb.height)}px` },
              { label: 'Gap available', value: `${Math.round(gap)}px` },
            ],
          }
        );
      }
    }
  }

  // Shared by checks 11 and 12: an element "carries its own text" if it has
  // a direct (non-whitespace) text node child - not just any element with
  // textContent, which would also match every container ancestor of every
  // real text node and flag the same words 3-4 times up the tree.
  function hasOwnText(el: Element): boolean {
    return Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0);
  }
  const textCarriers = Array.from(document.querySelectorAll('*')).filter((el) => isVisible(el) && hasOwnText(el));

  // --- 11. Text rendered too small to comfortably read on a phone ---
  const MIN_READABLE_FONT_SIZE = 12; // px
  textCarriers.forEach((el) => {
    const fontSize = parseFloat(getComputedStyle(el).fontSize);
    if (Number.isFinite(fontSize) && fontSize < MIN_READABLE_FONT_SIZE - 0.5) {
      addIssue(
        'tiny-text',
        `Text renders at ${fontSize}px - below the ${MIN_READABLE_FONT_SIZE}px minimum commonly considered legible on a phone.`,
        el,
        Math.round((MIN_READABLE_FONT_SIZE - fontSize) * 10) / 10,
        {
          expected: `≥ ${MIN_READABLE_FONT_SIZE}px`,
          actual: `${fontSize}px`,
          delta: `Short by: ${Math.round((MIN_READABLE_FONT_SIZE - fontSize) * 10) / 10}px`,
        }
      );
    }
  });

  // --- 12. Text/background color contrast below WCAG AA - the same
  // relative-luminance formula (WCAG 2.x) a browser devtools accessibility
  // panel uses, computed here from real `getComputedStyle()` colors rather
  // than guessed from class names. `effectiveBackground` walks up the
  // ancestor chain because most elements have `background: transparent`
  // and inherit their real painted background from a parent.
  //
  // Colors are parsed via a 1x1 canvas instead of a `rgba(...)` regex:
  // modern browsers don't always serialize `getComputedStyle().color`/
  // `.backgroundColor` as `rgb()`/`rgba()` - Tailwind v4's default palette
  // in particular resolves to wide-gamut `lab(...)`/`oklch(...)` strings in
  // Chromium, which a plain regex can't parse at all (silently returning
  // null, which made every element with a color in one of those spaces
  // fall through to "no background found here" and read as a false-positive
  // near-1:1 contrast failure against the assumed-white fallback below).
  // Painting the string onto a canvas and reading the pixel back leans on
  // the browser's own, always-correct color parser regardless of the color
  // function used, and returns it pre-converted to plain 0-255 sRGB - the
  // space the WCAG contrast formula is defined in anyway. Cached by the
  // literal color string since the same computed color repeats constantly
  // across a real page (avoids a canvas readback per element).
  interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
  }
  const colorParseCache = new Map<string, Rgba | null>();
  let parseColorCtx: CanvasRenderingContext2D | null = null;
  function parseColor(str: string): Rgba | null {
    if (!str) return null;
    if (colorParseCache.has(str)) return colorParseCache.get(str) ?? null;
    if (!parseColorCtx) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      parseColorCtx = canvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = parseColorCtx;
    if (!ctx) return null; // no 2d context available - shouldn't happen in a real browser
    ctx.clearRect(0, 0, 1, 1); // reset to fully transparent before every parse
    ctx.fillStyle = str; // browser parses ANY valid CSS color syntax here
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const result: Rgba = { r, g, b, a: a / 255 };
    colorParseCache.set(str, result);
    return result;
  }
  function relativeLuminance({ r, g, b }: Rgba): number {
    const toLinear = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }
  function contrastRatio(rgb1: Rgba, rgb2: Rgba): number {
    const l1 = relativeLuminance(rgb1);
    const l2 = relativeLuminance(rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
  // Walks up from `el` alpha-compositing every painted background it finds
  // ("source-over", the element's own background sits on top of its
  // ancestors' backgrounds) until the accumulated color is fully opaque or
  // the tree runs out, then treats any remaining transparency as the page's
  // own white. This has to be real compositing, not "first non-transparent
  // background wins": a translucent overlay - a totally ordinary Tailwind
  // pattern like `bg-black/[.06]` for a subtle badge tint - is NOT the color
  // it would be at full opacity. Returning it as-is (as this function used
  // to do) reads `black at 6% opacity` as `black`, comparing text against a
  // background luminance of ~0 instead of the ~94%-white it's actually
  // painted as, which manufactured a bogus near-black contrast failure on
  // every one of these overlays.
  function effectiveBackground(el: Element): Rgba {
    let node: Element | null = el;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0; // accumulated alpha so far (0 = fully transparent stack)
    while (node && a < 0.999) {
      const bg = parseColor(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) {
        // Composite the ancestor's color (dst) underneath what's
        // accumulated above it so far (src).
        const outA = a + bg.a * (1 - a);
        if (outA > 0) {
          r = (r * a + bg.r * bg.a * (1 - a)) / outA;
          g = (g * a + bg.g * bg.a * (1 - a)) / outA;
          b = (b * a + bg.b * bg.a * (1 - a)) / outA;
        }
        a = outA;
      }
      node = node.parentElement;
    }
    if (a < 0.999) {
      // Ran out of ancestors (or never fully opaque) - composite the
      // remainder over the page's own white.
      const outA = a + 1 * (1 - a);
      r = (r * a + 255 * (1 - a)) / outA;
      g = (g * a + 255 * (1 - a)) / outA;
      b = (b * a + 255 * (1 - a)) / outA;
      a = outA;
    }
    return { r, g, b, a };
  }
  textCarriers.forEach((el) => {
    const style = getComputedStyle(el);
    const fg = parseColor(style.color);
    if (!fg) return;
    // Start the search AT the element itself, not its parent: a badge/pill
    // like BugCard's numbered circle (`bg-zinc-800 text-white` on the SAME
    // span) carries its own opaque background directly, and skipping
    // straight to the parent would miss it entirely - comparing the text
    // against whatever's further up instead (often nothing opaque, falling
    // back to "assume white"), which is how this first went wrong: white
    // text vs. an incorrectly-assumed white page background reads as a
    // false-positive 1:1 "contrast failure" on an element that's actually
    // ~15:1 in reality.
    const bg = effectiveBackground(el);
    const ratio = contrastRatio(fg, bg);
    const fontSize = parseFloat(style.fontSize);
    const isBold = parseInt(style.fontWeight, 10) >= 700;
    // WCAG AA: 3:1 for "large" text (>=18px, or >=14px bold), 4.5:1 otherwise.
    const isLargeText = fontSize >= 18 || (fontSize >= 14 && isBold);
    const threshold = isLargeText ? 3 : 4.5;
    if (ratio < threshold - 0.02) {
      addIssue(
        'low-contrast-text',
        `Text/background contrast is ${ratio.toFixed(2)}:1 - below the WCAG AA minimum of ${threshold}:1 for ${isLargeText ? 'large' : 'normal'} text.`,
        el,
        Math.round((threshold - ratio) * 100) / 100,
        {
          expected: `≥ ${threshold}:1`,
          actual: `${ratio.toFixed(2)}:1`,
          delta: `Short by: ${(Math.round((threshold - ratio) * 100) / 100).toFixed(2)}`,
        }
      );
    }
  });

  // --- 13. Image rendered at a different aspect ratio than its natural
  // size - stretched or squished, not just oversized (check 6's territory,
  // which only compares width against the parent container). ---
  const ASPECT_RATIO_TOLERANCE = 0.1; // 10% deviation
  Array.from(document.querySelectorAll('img'))
    .filter(isVisible)
    .forEach((img) => {
      if (!img.naturalWidth || !img.naturalHeight) return; // not loaded - see check 6's broken-image
      const rect = img.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const naturalRatio = img.naturalWidth / img.naturalHeight;
      const renderedRatio = rect.width / rect.height;
      const deviation = Math.abs(renderedRatio - naturalRatio) / naturalRatio;
      if (deviation > ASPECT_RATIO_TOLERANCE) {
        // Simplified "W:H" ratio strings (e.g. "16:9"), not raw decimals -
        // reads the same way a designer would describe an aspect ratio.
        const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
        const simplifyRatio = (w: number, h: number) => {
          const divisor = gcd(Math.round(w), Math.round(h)) || 1;
          return `${Math.round(w / divisor)}:${Math.round(h / divisor)}`;
        };
        addIssue(
          'distorted-image',
          `Rendered at ${Math.round(rect.width)}x${Math.round(rect.height)} (ratio ${renderedRatio.toFixed(2)}) but its natural size is ${img.naturalWidth}x${img.naturalHeight} (ratio ${naturalRatio.toFixed(2)}) - stretched/squished by ${Math.round(deviation * 100)}%.`,
          img,
          Math.round(deviation * 100),
          {
            expected: `${simplifyRatio(img.naturalWidth, img.naturalHeight)} (natural ${img.naturalWidth}x${img.naturalHeight})`,
            actual: `${simplifyRatio(rect.width, rect.height)} (rendered ${Math.round(rect.width)}x${Math.round(rect.height)})`,
            delta: `Distorted by: ${Math.round(deviation * 100)}%`,
          }
        );
      }
    });

  // --- 14. Missing or misconfigured <meta name="viewport"> - the classic
  // reason a mobile browser renders a page at desktop width (~980px) and
  // scales the whole thing down, making everything look uniformly tiny
  // regardless of any CSS media query on the page. Page-level, not tied to
  // any one element - always reported once per scan, not once per offender. ---
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  const viewportContent = viewportMeta ? viewportMeta.getAttribute('content') || '' : '';
  if (!viewportMeta || !/width\s*=\s*device-width/i.test(viewportContent)) {
    addIssue(
      'missing-viewport-meta',
      viewportMeta
        ? `<meta name="viewport"> is present but its content ("${viewportContent}") doesn't set width=device-width - mobile browsers may still render this page at desktop width and scale it down.`
        : 'No <meta name="viewport"> tag - mobile browsers render this page at desktop width (typically ~980px) and scale it down, making everything look tiny.',
      document.documentElement,
      null,
      {
        expected: 'width=device-width',
        actual: viewportMeta ? `"${viewportContent}"` : 'no <meta name="viewport"> tag',
        delta: null,
      }
    );
  }

  return { issues, scrollX: window.scrollX, scrollY: window.scrollY };
}

// The fifteen check identifiers this file can produce, kept in one place so
// the API route and frontend can share a single source of truth for
// validation/labels instead of re-typing the list. (`broken-image` was
// previously missing from this list despite being a real, reachable
// addIssue() call above - fixed here alongside the 6 new checks.)
export const CHECK_TYPES: string[] = [
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
