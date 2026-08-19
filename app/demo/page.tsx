import { BugCard } from './BugCard';

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
        </code>
        for 9 more
        real bugs, each with its own fix at a different breakpoint (Desktop, 1440px) than the bugs here - including
        overlapping elements, an off-screen element, and a fixed bar covering content.
      </p>
    </main>
  );
}
