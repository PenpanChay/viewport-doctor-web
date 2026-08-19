'use client';

import { useEffect, useState } from 'react';

/**
 * Live client-side readout for the one demo bug on this page that's
 * viewport-conditional by design (the "Oversized modal" card, see
 * page.tsx) - it's ONLY actually broken when the browser window is
 * narrower than the dialog's fixed width. Without this, someone looking
 * at the page on an ordinary wide monitor just sees a box that fits
 * fine, with no way to tell whether that's the correct/expected state
 * or whether the demo has silently stopped working. This states, in the
 * moment, which case is currently true for the window it's rendered in
 * - not a static screenshot's worth of truth, but this exact
 * `window.innerWidth`, so narrowing the browser to see the bug appear is
 * something you can watch happen instead of having to trust the prose.
 */
export function ViewportStatus({ breakpointPx }: { breakpointPx: number }) {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Nothing rendered until mounted - avoids a server/client markup
  // mismatch (the server has no window to read a width from).
  if (width === null) return null;

  const broken = width < breakpointPx;
  return (
    <p
      className={`mt-2 text-xs font-medium ${
        broken ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
      }`}
    >
      {broken
        ? `⚠️ Overflowing right now — your window (${width}px) is narrower than the ${breakpointPx}px dialog.`
        : `✅ Fits right now — your window (${width}px) is wider than the ${breakpointPx}px dialog. Narrow it below ${breakpointPx}px to see the bug appear.`}
    </p>
  );
}
