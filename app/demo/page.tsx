/**
 * Bundled demo target for viewport-doctor-web itself - a real React page
 * (Server Component, no interactivity needed).
 *
 * REDESIGN (v2): every bug on this page now follows one narrative - looks
 * completely fine from Tablet (768px) up, and breaks in a specific,
 * different way only below the `sm` breakpoint (640px). That's a
 * deliberate choice, not a coincidence of picking checks that happen to
 * behave that way: it's the clearest way to demonstrate why scanning only
 * one "does it look okay on my monitor" viewport misses real bugs - every
 * card here would pass a glance on a laptop and still ship broken to a
 * phone. `sm:` (640px) was picked as the one shared threshold for both
 * bugs so a single before/after comparison (Mobile vs. Tablet, see
 * test/scanViewport.test.ts) demonstrates all of them at once instead of
 * needing a different breakpoint pair per card.
 *
 * The previous v1 of this page (see git history) demonstrated
 * `clipped-element` (viewport-independent) and `oversized-modal`
 * (viewport-dependent, but a jarring "obviously oversized" kind of bug).
 * This version demonstrates 2 checks that are both viewport-dependent AND
 * the kind of subtle regression a real team ships: an image whose fixed
 * size only fits its box on wider screens, and a label whose fixed width
 * only clears its text once the layout has room. `clipped-element` and
 * `oversized-modal` are still exercised by real tests - just via
 * /demo/edge-cases (see that page) instead of here.
 *
 * A 3rd bug design (a "Popular" badge overlapping a "Pro plan" button,
 * exercising `overlapping-elements`) was cut from this page during review:
 * keeping it genuinely viewport-dependent required leaving a *small*
 * residual overlap even at Tablet+ (just under the checker's 30% threshold)
 * rather than clearing it outright, which read as "still a little broken"
 * instead of "clean." `overlapping-elements` is back on this page in a
 * different shape, but the SAME "fine on Tablet+, broken below `sm`" story
 * as the other 2 bugs here: all 4 tiles in the quick-stat strip below are
 * explicitly pinned to the exact same grid cell below `sm` (all 4 stacked
 * on top of each other, not just 2), and each gets its own column back once
 * the strip switches to a 4-column layout at `sm` and up - so the strip
 * reads as 4 clean tiles side by side on a laptop, and as one crowded,
 * overlapping mess on a phone. See that section's own comment for the
 * mechanism, and lib/checks.ts / lib/suggestFixes.ts for how the tool now
 * recognizes "two grid items pinned to one cell" as its own distinct case
 * with its own (real, working) fix - `grid-column`, not margin.
 *
 * `w-full` on <main> below isn't decorative: layout.tsx makes <body> a
 * column flexbox, and a flex item with `mx-auto` (auto side margins)
 * disables the default cross-axis stretch, so its width falls back to
 * `fit-content` instead of "fill the available space" - meaning an
 * unshrinkable-width descendant could pull <main>'s OWN computed width up
 * towards it (bounded by max-w-3xl), not just overflow past it. `w-full`
 * gives <main> an explicit, content-independent width, so nothing on this
 * page can inflate it just by being wide.
 */

import { BugCard } from './BugCard';

const STATS: { id: string; value: string; label: string; gridClassName: string; fanClassName: string }[] = [
  // Every tile is pinned to the SAME explicit grid cell (col-start-1
  // row-start-1) below `sm`, and gets its own column (1 through 4) back at
  // `sm` and up - see the section comment below for why. `fanClassName` is
  // purely cosmetic (see that comment too): a few px of cascading offset
  // per tile below `sm`, reset to 0 at `sm` and up.
  {
    id: 'stat-bug-count',
    value: '3',
    label: 'Bugs on this page',
    gridClassName: 'col-start-1 row-start-1',
    fanClassName: '',
  },
  {
    id: 'stat-break-point',
    value: '<640px',
    label: 'Where they all break',
    gridClassName: 'col-start-1 row-start-1 sm:col-start-2',
    fanClassName: 'translate-x-1 translate-y-1 sm:translate-x-0 sm:translate-y-0',
  },
  {
    id: 'stat-pass-point',
    value: 'Tablet+',
    label: 'Where they all pass',
    gridClassName: 'col-start-1 row-start-1 sm:col-start-3',
    fanClassName: 'translate-x-2 translate-y-2 sm:translate-x-0 sm:translate-y-0',
  },
  {
    id: 'stat-check-count',
    value: '15',
    label: 'Checks in the tool',
    gridClassName: 'col-start-1 row-start-1 sm:col-start-4',
    fanClassName: 'translate-x-3 translate-y-3 sm:translate-x-0 sm:translate-y-0',
  },
];

export default function DemoPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 font-sans text-zinc-900 dark:text-zinc-50">
      <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
        Live demo
      </span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Viewport UI Checker - Demo</h1>
      <p className="mt-3 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        Every card below looks completely fine on a laptop or desktop. Scan this page at Mobile vs. Tablet/Laptop/
        Desktop and compare - all 3 bugs only show up below 640px wide.
      </p>

      {/* Quick-stat strip: a real CSS grid (2 columns on mobile, 4 from
          `sm` up) - and this page's 3rd bug (`overlapping-elements`), same
          "fine on Tablet+, broken below `sm`" story as the other 2 bugs
          below, just with all 4 tiles instead of 1 flagged element.
          Tailwind's `grid-cols-*` utilities compile to `repeat(N, minmax(0,
          1fr))` (never a bare `1fr`), and `min-w-0` is a redundant safety
          net against a grid item's default content-based minimum width -
          both still true, and still what keeps every tile from overflowing
          its own track at any width. The bug here isn't overflow, it's
          placement: every one of the 4 tiles is given an EXPLICIT
          `col-start`/`row-start` (see the STATS array above) instead of
          leaning on source-order auto-placement, and below `sm` ALL FOUR
          resolve to `col-start-1 row-start-1` - the exact same cell. CSS
          Grid allows any number of items to share one cell (it's not a
          layout error, nothing here is accidental) - they simply all
          stretch to fill it, so all 4 boxes end up stacked exactly on top
          of each other below `sm`: the smaller the screen gets, the more
          of the strip collapses into that one crowded cell, and only the
          LAST tile in DOM order ("15 / Checks in the tool") stays visible,
          the other 3 completely hidden underneath it. Each tile's own
          `sm:col-start-N` override (2, 3, 4 - the 1st tile needs none,
          `col-start-1` is already where it belongs at `sm` too) gives it
          back its own column the moment the strip switches to 4 columns,
          so from Tablet up the strip reads as 4 clean tiles side by side -
          no visual trace of the collision underneath.
          Each tile is a real <button>, not a <div> - `overlapping-elements`
          only scans interactive elements (button, a[href], input,
          [role="button"]), same requirement as the "NEW" badge on
          /demo/edge-cases. Each also gets a unique `id` so its generated
          selector can't collide with another tile's - describe() (see
          lib/checks.ts) falls back to an element's first 2 CSS classes
          when there's no id, and every tile here shares the same base
          classes, which is exactly the kind of ambiguity an id sidesteps.
          With 4 elements fully coinciding below `sm`, the checker's
          pairwise overlap algorithm genuinely reports one issue per pair
          (6 raw issues - see test/scanViewport.test.ts), which collapse to
          3 distinct fix suggestions (tile 1 vs. 2, tile 2 vs. 3, tile 3 vs.
          4 - each pairing's EARLIER tile is what the checker flags and
          suggests a fix for, per lib/checks.ts).
          Unlike this page's other 2 bugs (fixed with plain CSS on the
          flagged element), this one's real, structural cause is that both
          flagged elements are CSS Grid items pinned to one shared cell -
          `margin-top` is a no-op there, since the later item just keeps
          stretching to fill the same cell regardless. lib/checks.ts now
          detects exactly this (two grid items resolving to the same
          explicit grid-column-start/grid-row-start) and lib/suggestFixes.ts
          responds with the fix that actually works for it: give the
          flagged tile its own `grid-column-start`, one line over from the
          shared one - verified end to end in test/previewFix.test.ts, a
          real `resolved` verdict, not just a detection.
          Two purely cosmetic touches, neither of which affects any of the
          above: (1) each tile's `fanClassName` nudges it a few px
          diagonally below `sm` (reset to 0 at `sm` and up) so the pile
          reads as 4 legibly stacked cards - like a fanned deck - instead
          of one flat tile that quietly swallows the other 3 with no visual
          hint they exist. `translate-*` doesn't change grid placement (all
          4 are still genuinely pinned to the same cell, and
          getBoundingClientRect - what the checker measures - includes the
          transform, so this shifts the measured overlap down from 100% to
          still comfortably >30%, nowhere near enough to mask the bug or
          affect the fix's `resolved` verdict: the suggested
          `grid-column-start` bump moves a tile a full column over, which
          dwarfs a few px of fan offset). (2) the dashed outline on the
          wrapper below is a real, visible "look here" flag drawn directly
          on the page - not just something that shows up in the tool's own
          scan screenshot - and it disappears at `sm` and up along with the
          bug it's flagging, via the same breakpoint. */}
      <div className="mt-8 rounded-xl p-1.5 outline-2 outline-dashed outline-amber-500 outline-offset-2 sm:rounded-none sm:p-0 sm:outline-none">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATS.map((stat) => (
            <button
              key={stat.id}
              id={stat.id}
              type="button"
              className={`${stat.gridClassName} ${stat.fanClassName} min-w-0 rounded-lg border border-black/[.08] bg-white p-3 text-center dark:border-white/[.1] dark:bg-zinc-900`}
            >
              <div className="text-xl font-semibold">{stat.value}</div>
              <div className="mt-0.5 text-xs leading-tight text-zinc-500 dark:text-zinc-400">{stat.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 1. Image that spills out of its frame: the frame itself is
          responsive (`w-40 sm:w-72`), but the image inside it is a fixed
          220px wide regardless of width - exactly the kind of image tag
          that looks fine because whoever added it only ever previewed it
          on a laptop, where the frame is 288px (wider than the image).
          Below `sm`, the frame shrinks to 160px while the image stays
          220px, so it overflows its own box by 60px - well past the
          checker's 4px rounding tolerance either way. */}
      <BugCard
        number={1}
        title="Image spills out of its frame"
        description="This image is fixed at 220px wide, but its frame shrinks to 160px on a phone - so on a phone the image spills out past its own frame by 60px. How it's fixed: from Tablet (768px) up the frame widens to 288px, comfortably wider than the image, so nothing spills out."
      >
        <div className="w-40 rounded-lg border border-zinc-300 p-2 dark:border-zinc-700 sm:w-72">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/demo-banner.svg"
            alt="Demo banner, fixed width, wider than its frame on a phone"
            width={220}
            height={53}
            className="w-[220px] max-w-none"
          />
        </div>
      </BugCard>

      {/* 2. Label text gets cut off: a fixed-width, overflow-hidden label
          with no wrap handling. `w-24` (96px) is too narrow for this text
          at any font size readable on a phone, so it clips below `sm`;
          `sm:w-56` (224px) gives it enough room that the same text fits
          on one line from Tablet up. */}
      <BugCard
        number={2}
        title="Label text gets cut off"
        description="This label's box is only 96px wide on a phone - too narrow for its own text, which gets clipped with no wrap or ellipsis. How it's fixed: from Tablet (768px) up the box widens to 224px, with room to spare for the text to fit on one line."
      >
        <p className="w-24 overflow-hidden whitespace-nowrap rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 sm:w-56">
          Outdoor Furniture Sale
        </p>
      </BugCard>

      <p className="mt-10 text-xs text-zinc-500 dark:text-zinc-400">
        Want to see more of what this tool catches? Head to{' '}
        <code className="rounded bg-black/[.06] px-1 py-0.5 text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
          /demo/edge-cases
        </code>{' '}
        for 9 more
        real bugs, each with its own fix at a different breakpoint (Desktop, 1440px) than the bugs here - including
        overlapping elements, an off-screen element, and a fixed bar covering content.
      </p>
    </main>
  );
}
