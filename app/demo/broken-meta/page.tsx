/**
 * Dedicated page for the missing-viewport-meta check - split out from
 * /demo/edge-cases (which now makes every other bug it hosts responsive,
 * clearing at Desktop/1440px+ - see that page's own top comment) because
 * this ONE check can't follow that pattern: a `<meta name="viewport">`
 * tag's `content` attribute is static HTML, evaluated once, with no
 * concept of "the current viewport width" - there's no CSS media query
 * equivalent for "serve a different meta tag above 1440px". So this bug
 * stays broken at every preset, on its own page, rather than forcing a
 * fake responsive story onto a check that fundamentally isn't one.
 *
 * The `viewport` export below deliberately breaks this route's own
 * `<meta name="viewport">` tag - Next.js otherwise injects a correct
 * `width=device-width` one automatically.
 */

import type { Viewport } from 'next';
import { BugCard } from '../BugCard';

// A fixed desktop width instead of `device-width` - the classic real-world
// version of this bug, where someone hardcodes a viewport width (often
// chasing an unrelated layout issue) and inadvertently makes mobile
// browsers render the whole page at desktop width and scale it down
// instead of laying out natively at the device's own width.
export const viewport: Viewport = {
  width: 1024,
};

export default function BrokenMetaPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 font-sans text-zinc-900 dark:text-zinc-50">
      <h1 className="text-xl font-semibold">Viewport UI Checker - missing/misconfigured viewport meta</h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        The 10th check from{' '}
        <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">/demo/edge-cases</code>, on its own
        page because it can&apos;t be made responsive like the others there - see this file&apos;s{' '}
        <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">viewport</code> export.
      </p>

      <BugCard
        number={1}
        title="Missing/misconfigured viewport meta"
        description={
          'This page’s <meta name="viewport"> content is hardcoded to "width=1024, initial-scale=1" instead of ' +
          'the standard "width=device-width, initial-scale=1" - a real mobile browser renders the page at a fixed ' +
          '1024px-wide layout and zooms it to fit the screen, instead of laying it out natively at the device’s ' +
          'own width. How it’s fixed: remove this file’s viewport export entirely (or set width: ' +
          '"device-width") so Next.js falls back to its own correct default - there’s no in-between "narrow vs. ' +
          'wide screen" version of this fix, since the tag itself doesn’t know the screen width until a real ' +
          'device reads it.'
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Nothing to see on the page itself - open devtools and check the{' '}
          <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">{'<head>'}</code>, or just run this
          tool against this page.
        </p>
      </BugCard>
    </main>
  );
}
