/**
 * A real page for "Breakpoint Discovery" (lib/discoverBreakpoints.ts) to
 * scan - the fixed Mobile/Tablet/Desktop viewport presets can't demonstrate
 * this feature on their own, since the whole point is finding a layout
 * change that ISN'T at one of the standard preset widths.
 *
 * Two card grids, each a real repeated-item layout (6 <article> cards) so
 * lib/discoverBreakpoints.ts's structural "columns per row" heuristic has
 * something real to track:
 *
 * - #grid-standard: an ordinary responsive grid (`.gridStandard` in
 *   page.module.css) that goes 1 → 3 columns exactly at the framework's
 *   own 768px breakpoint - a real layout change, but an EXPECTED one
 *   (close to a standard breakpoint), so Breakpoint Discovery should
 *   report it without flagging it.
 * - #grid-surprise: goes 2 → 1 columns at a deliberately arbitrary,
 *   nowhere-near-standard 742px (`.gridSurprise` in page.module.css) - the
 *   realistic version of this bug: someone added a one-off breakpoint
 *   while debugging a specific screenshot and never reconciled it with the
 *   rest of the design system's scale. This is the one Breakpoint
 *   Discovery should flag as "unexpected".
 */

import styles from './page.module.css';

const CARDS = [
  { title: 'Wireless Headphones', price: '$89.00' },
  { title: 'Mechanical Keyboard', price: '$129.00' },
  { title: 'Desk Lamp', price: '$39.00' },
  { title: 'Webcam 1080p', price: '$59.00' },
  { title: 'USB-C Hub', price: '$34.00' },
  { title: 'Monitor Stand', price: '$45.00' },
];

function ProductCard({ title, price }: Readonly<{ title: string; price: string }>) {
  return (
    <article className={styles.card}>
      <div className={styles.cardThumb} aria-hidden />
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardPrice}>{price}</p>
    </article>
  );
}

export default function BreakpointDemoPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Breakpoint Discovery - demo page</h1>
      <p className={styles.intro}>
        Two product grids below behave identically in every way except WHERE their column count changes. Run
        Breakpoint Discovery against this page: it should report the first grid&apos;s 1→3 column change at 768px as
        expected (a standard breakpoint), and the second grid&apos;s 2→1 column change at 742px as unexpected -
        nowhere near 640/768/1024/1280.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Grid A - standard breakpoint (1 → 3 columns at 768px)</h2>
        <div id="grid-standard" className={styles.gridStandard}>
          {CARDS.map((c) => (
            <ProductCard key={c.title} {...c} />
          ))}
        </div>
      </section>

      <section className={styles.sectionSecond}>
        <h2 className={styles.sectionHeading}>Grid B - unexpected breakpoint (2 → 1 columns at 742px, not a standard breakpoint)</h2>
        <div id="grid-surprise" className={styles.gridSurprise}>
          {CARDS.map((c) => (
            <ProductCard key={c.title} {...c} />
          ))}
        </div>
      </section>
    </main>
  );
}
