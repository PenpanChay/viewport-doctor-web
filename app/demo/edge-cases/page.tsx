/**
 * The other 9 of the tool's 15 checks - split out from the main /demo page
 * so that page can stay to a handful of easy-to-read bugs. This page
 * exists for thoroughness (there's a real page to scan and real tests
 * running against every check, not just the headline ones) rather than
 * as the first thing to show someone new to the tool - see /demo instead
 * for that.
 *
 * Unlike the first version of this page, every bug here is now RESPONSIVE,
 * not "broken no matter what": each one clears specifically at Desktop
 * (1440px) and Large Desktop (1920px), and stays broken at every smaller
 * preset (Mobile S/Mobile/Mobile Large/Tablet/Tablet Landscape/Laptop, up
 * to 1280px) - via a real `@media (min-width: 1440px)` block per rule in
 * page.module.css, the same breakpoint /demo/breakpoint-demo uses (there
 * via a Tailwind arbitrary variant instead). This mirrors the real "looks
 * fine on a laptop, breaks on smaller screens" story every bug on the
 * main /demo page already tells, just for the checks that live here.
 *
 * missing-viewport-meta is the one exception - see /demo/broken-meta
 * instead: a `<meta name="viewport">` tag's content is static HTML, not a
 * CSS rule, so there's no way to make it "correct above 1440px, wrong
 * below it" the way every other bug here can be scoped. It's demonstrated
 * on its own dedicated page instead of forcing a fake responsive story onto
 * a bug that fundamentally isn't one.
 *
 * Two of these (the announcement bar and the "Saved" toast) are
 * deliberately rendered outside <main>, fixed-positioned - see each one's
 * own comment below for why.
 */

import { BugCard } from '../BugCard';
import styles from './page.module.css';

export default function EdgeCasesPage() {
  return (
    <>
      {/* Fixed element covering content: a top announcement bar with no
          matching padding-top on <main> below 1440px, so it sits directly
          over the page's own <h1> at the very top of the page - the
          "bottom nav hides the last row of content" bug from the brief,
          just docked to the top edge instead so it's guaranteed visible
          without scrolling at any viewport height. A fixed inline height
          (rather than letting the two lines of text size it) guarantees it
          fully covers the <h1> below regardless of font metrics. Fixed at
          1440px+ by giving <main> matching top padding (see `.main` in
          page.module.css) - the bar itself never needs to change. */}
      <div className={styles.announcementBar}>
        Free shipping on every order today only - announcement bar with no page padding to match below 1440px
      </div>

      {/* Off-screen positioned element: a "Saved" toast button pinned with
          `top: -20px` below 1440px, pushing it 20px above the viewport's
          top edge. Deliberately a vertical offset rather than horizontal:
          horizontal-overflow only ever measures
          document.documentElement.scrollWidth (horizontal scrolling), so it
          cannot catch an element pushed off the TOP or BOTTOM edge - this
          is exactly the gap offscreen-element exists to close. An
          interactive element (not a plain div) since that's what the check
          itself scans, matching clipped-element/overlapping-elements.
          At 1440px+ it also moves from top-center to the bottom-right
          corner instead of just unsticking `top`: top-center at 1440px+
          would still sit inside the announcement bar's 96px band, so
          fixed-overlap would keep firing (still "covered" by a fixed
          element) - it needs an actual position change, not just a
          different offset. Its text also switches to pure black at the
          same breakpoint: `#022f2e` (teal-950) measures only ~3.95:1
          contrast against this teal-600 background (short of the 4.5:1 AA
          minimum for this text size), while pure black clears ~5.7:1. */}
      <button type="button" className={styles.toast}>
        ✓ Saved
      </button>

      {/* width: 100% on <main>: <body> in layout.tsx is a column flexbox,
          and a flex item with auto side margins loses the default stretch
          sizing, falling back to fit-content - which any future
          unshrinkable-width content added to this page could pull wider
          than the viewport. An explicit 100% width keeps <main>'s width
          content-independent. See /demo's page.tsx for the detailed
          explanation of this exact failure mode.
          The top padding at 1440px+ (`.main` in page.module.css) is the
          other half of the fixed-overlap fix above: 96px of extra top
          padding, exactly matching the announcement bar's own height, so
          from Desktop up the heading below has room to clear it. */}
      <main className={styles.main}>
        <h1 className={styles.heading}>Viewport UI Checker - More edge cases</h1>
        <p className={styles.intro}>
          The 9 checks not shown on the main <code className={styles.inlineCode}>/demo</code> page (there&apos;s a
          10th, missing-viewport-meta, on its own page - see the note at the bottom). Every one below is broken from
          Mobile S up through Laptop (1280px), and clears from Desktop (1440px) up - scan this page at each preset
          and compare.
        </p>

        {/* Overlapping elements: a "NEW" badge anchor positioned directly
            over a sibling button below 1440px - two independent
            interactive elements whose boxes genuinely overlap, not a
            parent/child relationship (which wouldn't count as a bug). */}
        <BugCard
          number={1}
          title="Overlapping elements"
          description="Below 1440px the “NEW” badge sits right on top of the button instead of next to it, hiding part of the label. How it's fixed: from Desktop (1440px) up, the badge switches from floating on top (position: absolute) to sitting normally beside the button (position: static + a small margin) - no more overlap."
        >
          <div className={styles.upgradeWrapper}>
            <button type="button" className={styles.upgradeButton}>
              Upgrade your plan
            </button>
            <a href="#" className={styles.newBadge}>
              NEW
            </a>
          </div>
        </BugCard>

        {/* Text overflow/truncation: a fixed-width label with long text
            below 1440px, no wrap/ellipsis handling. */}
        <BugCard
          number={2}
          title="Text overflow"
          description="Below 1440px this label's box is too narrow for its own text, so the text gets cut off with no wrap or ellipsis. How it's fixed: from Desktop (1440px) up, the box is allowed to size itself to its content (width: auto) and the text wraps normally instead of being clipped."
        >
          <p className={styles.textOverflowLabel}>This label text is much longer than its fixed-width box</p>
        </BugCard>

        {/* Overflowing image: an image with a fixed px width wider than its
            container below 1440px, no max-width: 100%. Sized via a CSS
            Modules class (not inline style) so a generated fixCode's
            class-based selector (see lib/checks.ts's describe()) has
            enough specificity to actually override it - the same pattern
            that makes /demo's oversized-dialog fix genuinely resolvable.
            This image is also wide enough to push the whole page past a
            mobile viewport below 1440px - the real (if incidental)
            exercise of horizontal-overflow's own fix, see
            test/previewFix.test.ts. */}
        <BugCard
          number={3}
          title="Overflowing image"
          description="Below 1440px this image is fixed at 500px wide and spills out past its own container, which is missing max-width: 100%. How it's fixed: from Desktop (1440px) up, the image is capped at 100% of its container's width instead of a fixed pixel size, so it can never spill out."
        >
          <div className={styles.overflowImageFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/demo-banner.svg"
              alt="Demo banner wider than its container"
              width={500}
              height={120}
              className={styles.overflowingImage}
            />
          </div>
        </BugCard>

        {/* Tiny tap target: an icon-only close button rendered at 18x18px
            below 1440px, below the 24px WCAG 2.5.8 minimum comfortable
            touch target size. Sized via a CSS Modules class (not inline
            style) so the 1440px override can win. */}
        <BugCard
          number={4}
          title="Tiny tap target"
          description="Below 1440px this close button is only 18x18px - smaller than the 24px minimum comfortable touch target size (WCAG 2.5.8). How it's fixed: from Desktop (1440px) up, it grows to a full 24x24px."
        >
          <button type="button" aria-label="Close" className={styles.tinyTapTarget}>
            &times;
          </button>
        </BugCard>

        {/* Cramped tap targets: two full-size buttons (each clears the 24px
            minimum on its own) placed only 4px apart below 1440px -
            comfortably under the 8px minimum spacing guideline, a
            genuinely different failure mode than either button being too
            small itself. */}
        <BugCard
          number={5}
          title="Cramped tap targets"
          description="Below 1440px these two buttons are each a comfortable size on their own, but only 4px apart - under the 8px minimum spacing recommended between separate tap targets. How it's fixed: from Desktop (1440px) up, the gap grows to a full 8px."
        >
          <div className={styles.crampedRow}>
            <button type="button" className={styles.crampedButton}>
              Save
            </button>
            <button type="button" className={styles.crampedButton}>
              Cancel
            </button>
          </div>
        </BugCard>

        {/* Tiny text: a caption rendered at 10px below 1440px, below the
            12px minimum commonly considered legible on a phone regardless
            of zoom. */}
        <BugCard
          number={6}
          title="Tiny text"
          description="Below 1440px this caption renders at only 10px - under the 12px minimum commonly considered legible on a phone. How it's fixed: from Desktop (1440px) up, it grows to a full 12px."
        >
          <p className={styles.tinyText}>Terms and conditions apply. See store for details.</p>
        </BugCard>

        {/* Distorted image: the same demo banner used in card 3, but here
            both width AND height are fixed independently below 1440px to a
            ratio very different from its natural 500x120 (~4.17:1) size,
            stretching it to ~1.5:1 instead of just being oversized (card
            3's territory, which only compares width against the
            container). */}
        <BugCard
          number={7}
          title="Distorted image"
          description="Below 1440px this image's natural size is 500x120 (a ~4.17:1 ratio), but it's forced into a 300x200 box - squished to ~1.5:1 instead of scaled proportionally. How it's fixed: from Desktop (1440px) up, only the width is set and the height switches to auto, so the browser scales it proportionally using its real 500x120 dimensions instead of stretching it."
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/demo-banner.svg"
            alt="Demo banner squished out of its natural aspect ratio below 1440px"
            width={500}
            height={120}
            className={styles.distortedImage}
          />
        </BugCard>

        <p className={styles.footer}>
          (Cards 8 and 9 - the fixed announcement bar covering this page&apos;s title, and the &quot;✓ Saved&quot;
          toast pinned just above the top edge below 1440px - are rendered outside this column; scroll up if you
          don&apos;t see them. The toast also happens to have low-contrast text below 1440px, fixed (alongside its
          position) by the same breakpoint. The 10th check this page is meant to cover,
          missing-viewport-meta, has its own dedicated page instead -{' '}
          <code className={styles.footerCode}>/demo/broken-meta</code> - since a{' '}
          <code className={styles.footerCode}>{'<meta name="viewport">'}</code> tag&apos;s content is static HTML,
          not CSS, so it can&apos;t be made &quot;wrong below 1440px, correct above it&quot; the way every other bug
          here can.)
        </p>
      </main>
    </>
  );
}
