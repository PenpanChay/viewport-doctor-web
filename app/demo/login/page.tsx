/**
 * A deliberately trivial login gate (hardcoded credentials, no real user
 * store - see lib/demoAuth.ts) whose only job is giving the Playwright
 * storageState auth feature (the "storageState" field on /api/scan)
 * something real to test against. /demo/protected redirects here whenever
 * the session cookie this page's form sets isn't present, exactly like a
 * real login wall would.
 */
import { DEMO_PASSWORD, DEMO_USERNAME } from '@/lib/demoAuth';

export default async function DemoLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-sm px-6 py-16 font-sans text-zinc-900 dark:text-zinc-50">
      <h1 className="text-xl font-semibold">Demo login</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Hardcoded credentials, just so this app has a real login wall to demonstrate scanning behind - use{' '}
        <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">{DEMO_USERNAME}</code> /{' '}
        <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">{DEMO_PASSWORD}</code>.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          Wrong username or password.
        </p>
      )}

      <form action="/api/demo-login" method="POST" className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Username</span>
          <input
            name="username"
            type="text"
            autoComplete="username"
            className="rounded-lg border border-black/[.1] bg-transparent px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-white/[.15]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            className="rounded-lg border border-black/[.1] bg-transparent px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-white/[.15]"
          />
        </label>
        <button
          type="submit"
          className="mt-1 self-start rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          Log in
        </button>
      </form>
    </main>
  );
}
