/**
 * A real page for Breakpoint Discovery to scan. The fixed viewport presets
 * cannot demonstrate this feature on their own because the point is finding a
 * layout change that is not at one of the standard viewport widths.
 *
 * Grid A changes at the expected 768px breakpoint. Grid B changes at the
 * deliberately arbitrary 742px breakpoint, which Breakpoint Discovery should
 * flag as unexpected.
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
        Two product grids below behave identically in every way except where the column count changes. Run Breakpoint
        Discovery against this page: it should report Grid A&apos;s 1-to-3 column change at 768px as expected, and Grid
        B&apos;s 2-to-1 column change at 742px as unexpected because it is nowhere near 640, 768, 1024, or 1280px.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Grid A - standard breakpoint (1 to 3 columns at 768px)</h2>
        <div id="grid-standard" className={styles.gridStandard}>
          {CARDS.map((card) => (
            <ProductCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className={styles.sectionSecond}>
        <h2 className={styles.sectionHeading}>Grid B - unexpected breakpoint (2 to 1 columns at 742px)</h2>
        <div id="grid-surprise" className={styles.gridSurprise}>
          {CARDS.map((card) => (
            <ProductCard key={card.title} {...card} />
          ))}
        </div>
      </section>
    </main>
  );
}
