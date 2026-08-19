import type { Browser } from 'playwright';
import { BREAKPOINT_BANDS, STANDARD_BREAKPOINTS } from './viewportPresets';
import type { BreakpointTransition, DiscoverBreakpointsResult, NearestStandardBreakpoint } from './types';

// How close (in px) a detected transition has to be to one of
// STANDARD_BREAKPOINTS to count as "expected" rather than "unexpected".
export const EXPECTED_TOLERANCE_PX = 6;

// How finely the coarse first pass samples the width range before binary
// search refines any transition it finds - fine enough to reliably catch a
// single-pixel-wide CSS breakpoint's effect without needing hundreds of
// samples (which would be slow even without a page reload per sample).
const COARSE_STEP_PX = 20;

// Binary search stops refining a transition once the bracket is this
// narrow - "the width, to within a couple of pixels" is all a developer
// needs to go find the responsible media query.
const REFINE_PRECISION_PX = 2;

interface CandidateInfo {
  id: number;
  selector: string;
  columns: number;
  childCount: number;
}

/**
 * Runs inside the browser (page.evaluate). Finds every plausible
 * "repeated-item grid/list" on the page - a container with several visible
 * children that are mostly the same tag (a card list, a product grid, a nav
 * bar's link list, ...) - and tags each one with a `data-vp-track-id`
 * attribute so later, cheaper measurement passes (measureColumnsInBrowser
 * below) can find the SAME elements again by attribute instead of
 * re-running this whole detection (and instead of relying on a CSS
 * selector string, which a real page's own classes aren't guaranteed to
 * make unique). Also returns each candidate's own describe()-style label
 * and its column count at whatever width this was called at, so the very
 * first sample doesn't need a separate measurement pass.
 *
 * "Columns" is measured structurally, not from a `display:grid` or `flex`
 * check (real pages implement multi-column layouts all sorts of ways) -
 * children are bucketed into rows by their own top y-coordinate (rounded
 * to an 8px band, since two items in the "same" row rarely land on the
 * exact same pixel), and the columns count is the size of the row with
 * the most items. A 1-column stack (every child in its own row) reports 1,
 * exactly the "before: 2-column, after: 1-column" signal a breakpoint
 * regression needs.
 */
function markCandidatesInBrowser(maxCandidates: number): CandidateInfo[] {
  function isVisible(el: Element): boolean {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function describe(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls =
      el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
    return `${tag}${id}${cls}`;
  }

  function columnsOf(el: Element): number {
    const kids = Array.from(el.children).filter(isVisible);
    if (kids.length < 2) return 1;
    const rows: { top: number; count: number }[] = [];
    kids.forEach((k) => {
      const top = Math.round(k.getBoundingClientRect().top / 8) * 8;
      let row = rows.find((r) => Math.abs(r.top - top) <= 4);
      if (!row) {
        row = { top, count: 0 };
        rows.push(row);
      }
      row.count += 1;
    });
    return Math.max(...rows.map((r) => r.count));
  }

  // Clear any markers left by a previous call (shouldn't happen in normal
  // use - one call per fresh page - but defensive against re-runs).
  document.querySelectorAll('[data-vp-track-id]').forEach((el) => el.removeAttribute('data-vp-track-id'));

  const all = Array.from(document.querySelectorAll('*'));
  const candidates: Element[] = [];
  for (const el of all) {
    const kids = Array.from(el.children).filter(isVisible);
    if (kids.length < 3) continue;
    const tagCounts = new Map<string, number>();
    kids.forEach((k) => tagCounts.set(k.tagName, (tagCounts.get(k.tagName) || 0) + 1));
    const [dominantTag, dominantCount] = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    // At least 3 children of one dominant tag, and that tag covering most
    // of the container's children - a real repeated-item pattern, not a
    // container that just happens to have 3-odd unrelated children.
    void dominantTag; // only the count is used below; kept for clarity of the destructure
    if (dominantCount >= 3 && dominantCount / kids.length >= 0.7) {
      candidates.push(el);
    }
    if (candidates.length >= maxCandidates) break;
  }

  return candidates.map((el, i) => {
    el.setAttribute('data-vp-track-id', String(i));
    return { id: i, selector: describe(el), columns: columnsOf(el), childCount: el.children.length };
  });
}

/**
 * Cheaper follow-up pass: re-measures ONLY the elements already tagged by
 * markCandidatesInBrowser (by attribute, not by re-scanning the whole
 * document), so every subsequent width sample in the scan loop is fast.
 */
function measureColumnsInBrowser(): Record<string, number> {
  function isVisible(el: Element): boolean {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function columnsOf(el: Element): number {
    const kids = Array.from(el.children).filter(isVisible);
    if (kids.length < 2) return 1;
    const rows: { top: number; count: number }[] = [];
    kids.forEach((k) => {
      const top = Math.round(k.getBoundingClientRect().top / 8) * 8;
      let row = rows.find((r) => Math.abs(r.top - top) <= 4);
      if (!row) {
        row = { top, count: 0 };
        rows.push(row);
      }
      row.count += 1;
    });
    return Math.max(...rows.map((r) => r.count));
  }
  const result: Record<string, number> = {};
  document.querySelectorAll('[data-vp-track-id]').forEach((el) => {
    const id = el.getAttribute('data-vp-track-id');
    if (id !== null) result[id] = columnsOf(el);
  });
  return result;
}

export function nearestStandardBreakpoint(width: number): NearestStandardBreakpoint | null {
  let best: NearestStandardBreakpoint | null = null;
  for (const bp of STANDARD_BREAKPOINTS) {
    const dist = Math.abs(bp.width - width);
    if (best === null || dist < best.dist) best = { ...bp, dist };
  }
  return best;
}

export interface DiscoverBreakpointsOptions {
  minWidth?: number;
  maxWidth?: number;
  height?: number;
  timeoutMs?: number;
  settleMs?: number;
  maxCandidates?: number;
}

/**
 * Scans a single real page across a range of viewport widths - NOT the
 * fixed Mobile/Tablet/Desktop presets - to find the actual width(s) where
 * its layout structurally changes (a tracked grid/list's column count goes
 * up or down), then flags any such change that DOESN'T land near one of
 * the common, presumably-intentional breakpoints (640/768/1024/1280px) as
 * "unexpected" - the "742px" surprise a fixed set of preset screenshots
 * can never catch, because none of the presets happen to straddle it.
 *
 * Uses ONE page and ONE navigation for the whole scan: every width sample
 * is just `page.setViewportSize()` (an in-page resize, no reload) followed
 * by a cheap attribute-scoped remeasurement, so scanning ~80 coarse widths
 * plus a few binary-search refinements per transition found stays fast
 * (seconds, not minutes) even though it's a much finer sweep than a
 * handful of fixed presets.
 */
export async function discoverBreakpoints(
  browser: Browser,
  url: string,
  options: DiscoverBreakpointsOptions = {}
): Promise<DiscoverBreakpointsResult> {
  const minWidth = options.minWidth ?? 320;
  const maxWidth = options.maxWidth ?? 1920;
  const height = options.height ?? 900;
  const timeoutMs = options.timeoutMs ?? 15000;
  const settleMs = options.settleMs ?? 60; // short - this loop can run 80+ times, not once
  const maxCandidates = options.maxCandidates ?? 20;

  const context = await browser.newContext({ viewport: { width: minWidth, height } });
  const page = await context.newPage();

  const base = { url, minWidth, maxWidth, bands: BREAKPOINT_BANDS, transitions: [] as BreakpointTransition[] };

  try {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
      await page.waitForTimeout(200);
    } catch (err) {
      return { ...base, navigationError: err instanceof Error ? err.message : String(err) };
    }

    const initial = await page.evaluate(markCandidatesInBrowser, maxCandidates);
    if (initial.length === 0) {
      // Nothing that looks like a repeated-item grid/list on this page at
      // all - genuinely nothing for this feature to say. Not an error.
      return base;
    }

    const bySelector = new Map(initial.map((c) => [c.id, c]));
    // { id -> [{width, columns}, ...] } across every width actually sampled.
    const series = new Map<number, { width: number; columns: number }[]>(
      initial.map((c) => [c.id, [{ width: minWidth, columns: c.columns }]])
    );

    for (let w = minWidth + COARSE_STEP_PX; w <= maxWidth; w += COARSE_STEP_PX) {
      await page.setViewportSize({ width: w, height });
      if (settleMs > 0) await page.waitForTimeout(settleMs);
      const measured = await page.evaluate(measureColumnsInBrowser);
      for (const [id, columns] of Object.entries(measured)) {
        const list = series.get(Number(id));
        if (list) list.push({ width: w, columns });
      }
    }
    // Always sample the exact maxWidth too, even if it wasn't hit exactly
    // by the step increments.
    const lastSampled = Array.from(series.values())[0]?.slice(-1)[0]?.width;
    if (lastSampled != null && lastSampled < maxWidth) {
      await page.setViewportSize({ width: maxWidth, height });
      if (settleMs > 0) await page.waitForTimeout(settleMs);
      const measured = await page.evaluate(measureColumnsInBrowser);
      for (const [id, columns] of Object.entries(measured)) {
        const list = series.get(Number(id));
        if (list) list.push({ width: maxWidth, columns });
      }
    }

    const transitions: BreakpointTransition[] = [];
    for (const [id, list] of series.entries()) {
      const candidate = bySelector.get(id);
      if (!candidate) continue;
      for (let i = 1; i < list.length; i++) {
        const below = list[i - 1];
        const aboveOrEqual = list[i];
        if (below.columns === aboveOrEqual.columns) continue;

        // Binary search between below.width and aboveOrEqual.width for the
        // exact (to within REFINE_PRECISION_PX) width the column count flips at.
        let lo = below.width;
        let hi = aboveOrEqual.width;
        while (hi - lo > REFINE_PRECISION_PX) {
          const mid = Math.round((lo + hi) / 2);
          await page.setViewportSize({ width: mid, height });
          if (settleMs > 0) await page.waitForTimeout(settleMs);
          const measured = await page.evaluate(measureColumnsInBrowser);
          const midColumns = measured[String(id)];
          if (midColumns === below.columns) {
            lo = mid;
          } else {
            hi = mid;
          }
        }

        const transitionWidth = hi;
        const nearest = nearestStandardBreakpoint(transitionWidth);
        transitions.push({
          selector: candidate.selector,
          width: transitionWidth,
          below: below.columns,
          aboveOrEqual: aboveOrEqual.columns,
          expected: nearest !== null && nearest.dist <= EXPECTED_TOLERANCE_PX,
          nearestStandardBreakpoint: nearest,
        });
      }
    }

    transitions.sort((a, b) => a.width - b.width);
    return { ...base, transitions };
  } finally {
    await context.close();
  }
}
