import type { ReactNode } from 'react';

/**
 * Shared "one bug, one card" layout used by both /demo and
 * /demo/edge-cases - a numbered badge, a title, a plain-language
 * description of what's wrong, then the actual markup that triggers the
 * bug. Kept as a shared component (not copy-pasted per page) so the two
 * demo pages read as one consistent system instead of two different
 * styles that happen to look similar.
 */
export function BugCard({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 rounded-xl border border-black/[.08] bg-white p-5 shadow-sm dark:border-white/[.1] dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-white dark:bg-zinc-200 dark:text-zinc-900">
          {number}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}
