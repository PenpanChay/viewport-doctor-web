/**
 * A real page for "Breakpoint Discovery" (lib/discoverBreakpoints.js) to
 * scan - the fixed Mobile/Tablet/Desktop viewport presets can't demonstrate
 * this feature on their own, since the whole point is finding a layout
 * change that ISN'T at one of the standard preset widths.
 *
 * Two card grids, each a real repeated-item layout (6 <article> cards) so
 * lib/discoverBreakpoints.js's structural "columns per row" heuristic has
 * something real to track:
 *
 * - #grid-standard: an ordinary Tailwind responsive grid (`grid-cols-1
 *   md:grid-cols-3`) that goes 1 → 3 columns exactly at the framework's own
 *   768px breakpoint - a real layout change, but an EXPECTED one (close to
 *   a standard breakpoint), so Breakpoint Discovery should report it
 *   without flagging it.
 * - #grid-surprise: goes 2 → 1 columns at a deliberately arbitrary,
 *   nowhere-near-standard 742px (via Tailwind's `max-[742px]:` arbitrary
 *   variant) - the realistic version of this bug: someone added a
 *   one-off breakpoint while debugging a specific screenshot and never
 *   reconciled it with the rest of the design system's scale. This is the
 *   one Breakpoint Discovery should flag as "unexpected".
 */

const CARDS = [
  { title: 'Wireless Headphones', price: '$89.00' },
  { title: 'Mechanical Keyboard', price: '$129.00' },
  { title: 'Desk Lamp', price: '$39.00' },
  { title: 'Webcam 1080p', price: '$59.00' },
  { title: 'USB-C Hub', price: '$34.00' },
  { title: 'Monitor Stand', price: '$45.00' },
];

function ProductCard({ title, price }: { title: string; price: string }) {
  return (
    <article className="rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <div className="mb-3 h-20 rounded-md bg-zinc-100 dark:bg-zinc-800" aria-hidden />
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{price}</p>
    </article>
  );
}

export default function BreakpointDemoPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16 font-sans text-zinc-900 dark:text-zinc-50">
      <h1 className="text-xl font-semibold">Breakpoint Discovery - demo page</h1>
      <p className="mt-3 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        Two product grids below behave identically in every way except WHERE their column count changes. Run
        Breakpoint Discovery against this page: it should report the first grid&apos;s 1→3 column change at 768px as
        expected (a standard breakpoint), and the second grid&apos;s 2→1 column change at 742px as unexpected -
        nowhere near 640/768/1024/1280.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Grid A - standard breakpoint (1 → 3 columns at 768px)
        </h2>
        <div id="grid-standard" className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          {CARDS.map((c) => (
            <ProductCard key={c.title} {...c} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Grid B - unexpected breakpoint (2 → 1 columns at 742px, not a standard breakpoint)
        </h2>
        <div id="grid-surprise" className="mt-3 grid grid-cols-2 gap-4 max-[742px]:grid-cols-1">
          {CARDS.map((c) => (
            <ProductCard key={c.title} {...c} />
          ))}
        </div>
      </section>
    </main>
  );
}
